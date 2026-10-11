"use strict";
const fs = require("node:fs");
const path = require("node:path");
const pug = require("pug");
const stylus = require("stylus");
const nib = require("nib");
const { JSDOM } = require("jsdom");
const root = path.resolve(__dirname, "..");
process.chdir(root);
fs.mkdirSync("build", { recursive: true });
const registry = {};
function add(id, filename, deps = {}) {
  registry[id] = { source: fs.readFileSync(filename, "utf8"), deps };
}
function walk(dir, fn) {
  for (const file of fs.readdirSync(dir, { withFileTypes: true })) {
    const name = path.posix.join(dir, file.name);
    if (file.isDirectory()) walk(name, fn);
    else fn(name);
  }
}
const dependencies = { jquery: "npm/jquery", mousetrap: "npm/mousetrap" };
for (const name of fs.readdirSync("vendor")) {
  const filename = path.join("vendor", name, "component.json");
  if (fs.existsSync(filename)) {
    const spec = JSON.parse(fs.readFileSync(filename));
    dependencies[spec.name] = name + "/" + (spec.main || "index.js");
  }
}
for (const name of fs.readdirSync("vendor")) {
  const filename = path.join("vendor", name, "component.json");
  if (!fs.existsSync(filename)) continue;
  const manifest = JSON.parse(fs.readFileSync(filename));
  const deps = {};
  for (const repo of Object.keys(manifest.dependencies || {})) {
    const key = repo.split("/").pop();
    const depFile = path.join(
      "vendor",
      repo.replace("/", "-"),
      "component.json",
    );
    const spec = JSON.parse(fs.readFileSync(depFile));
    deps[key] = dependencies[spec.name];
    deps[spec.name] = dependencies[spec.name];
  }
  for (const script of manifest.scripts || [])
    add(name + "/" + script, path.join("vendor", name, script), deps);
}
add("npm/jquery/index.js", "node_modules/jquery/dist/jquery.js");
add("npm/mousetrap/index.js", "node_modules/mousetrap/mousetrap.js");
// Geometry and shaders already contain their exported source. Shader overrides
// are generated into the bundle, keeping the source tree free of build outputs.
const files = JSON.parse(fs.readFileSync("component.json")).scripts.concat(
  "lib/rtc.js",
);
for (const renderer of ["renderer-3d", "renderer-css"]) {
  const spec = JSON.parse(
    fs.readFileSync("lib/" + renderer + "/component.json"),
  );
  files.push(...spec.scripts.map((f) => "lib/" + renderer + "/" + f));
}
files.push("lib/renderer-3d/geometry/paw.js");
for (const file of new Set(files)) {
  if (file === "index.js") continue;
  add("slam/" + file, file, dependencies);
  const shader = file.replace(/\.js$/, ".glsl");
  if (file.startsWith("lib/renderer-3d/shaders/") && fs.existsSync(shader))
    registry["slam/" + file].source =
      "module.exports=" + JSON.stringify(fs.readFileSync(shader, "utf8")) + ";";
}
add("slam/index.js", "index.js", dependencies);
const runtime = `(function(global){
  var modules={},cache={};
  function normalize(id){var result=[];id.split('/').forEach(function(p){if(p==='..')result.pop();else if(p&&p!=='.')result.push(p);});return result.join('/');}
  function resolve(id){id=normalize(id);var choices=[id,id+'.js',id+'/index.js'];for(var i=0;i<choices.length;i++)if(modules[choices[i]])return choices[i];throw new Error('Cannot find module '+id);}
  function load(id){id=resolve(id);if(cache[id])return cache[id].exports;var module=cache[id]={exports:{}};var spec=modules[id];function local(name){var target=name.charAt(0)==='.'?id.slice(0,id.lastIndexOf('/')+1)+name:(spec.deps[name]||name);return load(target);}spec.fn.call(global,local,module,module.exports);return module.exports;}
  global.require=function(name){return load(({slam:'slam', 'component-jquery':'npm/jquery', '../renderer-3d':'slam/lib/renderer-3d','../renderer-css':'slam/lib/renderer-css'})[name]||name);};
  global.require.register=function(id,fn,deps){modules[id]={fn:fn,deps:deps||{}};};
})(window);\n`;
let bundle = runtime;
for (const [id, spec] of Object.entries(registry))
  bundle +=
    "require.register(" +
    JSON.stringify(id) +
    ",function(require,module,exports){\n" +
    spec.source +
    "\n}," +
    JSON.stringify(spec.deps) +
    ");\n";
fs.writeFileSync("build/build.js", bundle);
// Renderers share the module cache so physics, settings and event emitters agree.
fs.writeFileSync(
  "build/build-3d.js",
  "// Renderer modules are registered by slam.js.\n",
);
fs.writeFileSync(
  "build/build-css.js",
  "// Renderer modules are registered by slam.js.\n",
);
const english = { "@@locale": "en-US", "@@context": "Cube Slam" };
for (const name of ["build", "tech"]) {
  const html = pug.renderFile("views/" + name + ".pug", { pretty: true });
  fs.writeFileSync("build/" + name + ".html", html);
  const dom = new JSDOM(html);
  for (const el of dom.window.document.querySelectorAll("[arb\\:id]"))
    english[el.getAttribute("arb:id")] =
      el.innerHTML || el.getAttribute("content");
  dom.window.close();
}
fs.writeFileSync(
  "build/localization.arb",
  "arb.register('cubeslam:en-US'," +
    JSON.stringify(english) +
    ");\n" +
    fs
      .readdirSync("lang/arbs")
      .filter((f) => f.endsWith(".arb") && f !== "en-US.arb")
      .map((f) => fs.readFileSync("lang/arbs/" + f, "utf8"))
      .join("\n"),
);
fs.mkdirSync("public/lang", { recursive: true });
// Store all languages in build so Docker does not need source language files.
fs.mkdirSync("build/lang", { recursive: true });
fs.writeFileSync(
  "build/lang/en-US.arb",
  "arb.register('cubeslam:en-US'," + JSON.stringify(english) + ");\n",
);
for (const file of fs
  .readdirSync("lang/arbs")
  .filter((f) => f.endsWith(".arb") && f !== "en-US.arb")) {
  const target = "public/lang/" + file;
  fs.copyFileSync("lang/arbs/" + file, "build/lang/" + file);
  if (
    fs.existsSync(target) ||
    (fs.lstatSync("public/lang").isDirectory() &&
      fs.readdirSync("public/lang").includes(file))
  )
    fs.unlinkSync(target);
  fs.symlinkSync("../../build/lang/" + file, target);
}
const englishLink = "public/lang/en-US.arb";
if (fs.readdirSync("public/lang").includes("en-US.arb"))
  fs.unlinkSync(englishLink);
fs.symlinkSync("../../build/lang/en-US.arb", englishLink);
fs.copyFileSync("build/lang/en-US.arb", "build/lang/en.arb");
if (fs.readdirSync("public/lang").includes("en.arb"))
  fs.unlinkSync("public/lang/en.arb");
fs.symlinkSync("../../build/lang/en.arb", "public/lang/en.arb");
stylus(fs.readFileSync("stylesheets/screen.styl", "utf8"))
  .set("filename", path.join(root, "stylesheets/screen.styl"))
  .use(nib())
  .render((err, css) => {
    if (err) throw err;
    fs.writeFileSync("build/build-stylus.css", css);
    console.log(
      "Built application, renderers, templates, styles and localization.",
    );
  });
