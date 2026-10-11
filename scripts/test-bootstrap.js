"use strict";
const { registerHooks } = require("node:module");
const fs = require("node:fs");
const path = require("node:path");
const aliases = {};
for (const name of fs.readdirSync(path.resolve(__dirname, "../vendor"))) {
  const base = path.resolve(__dirname, "../vendor", name);
  if (!fs.existsSync(path.join(base, "component.json"))) continue;
  const spec = JSON.parse(fs.readFileSync(path.join(base, "component.json")));
  // Keep debug's supported Node implementation; vendor the browser version.
  if (spec.name !== "debug")
    aliases[spec.name] = path.join(base, spec.main || "index.js");
}
registerHooks({
  resolve(specifier, context, nextResolve) {
    return nextResolve(aliases[specifier] || specifier, context);
  },
});
console.assert = require("node:assert").ok;
// Simulation uses the room path as its deterministic random seed in browsers.
global.location = new URL("http://localhost/test-room");
const { JSDOM } = require("jsdom");
const dom = new JSDOM("<!doctype html><body></body>", {
  url: "http://localhost/test-room",
});
global.window = dom.window;
global.document = dom.window.document;
