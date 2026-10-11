"use strict";
require("../scripts/test-bootstrap");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");
const { test } = require("node:test");
const settings = require("../lib/settings");
const actions = require("../lib/actions");
const inputs = require("../lib/inputs");
const puppeteer = require("../lib/puppeteer");
const renderTime = require("../lib/support/render-time");

function load(filename, overrides = {}, globals = {}) {
  const absolute = path.join(__dirname, "..", filename);
  const localRequire = createRequire(absolute);
  const mod = { exports: {} };
  new Function(
    "require",
    "module",
    "exports",
    ...Object.keys(globals),
    fs.readFileSync(absolute, "utf8"),
  )(
    (id) => (Object.hasOwn(overrides, id) ? overrides[id] : localRequire(id)),
    mod,
    mod.exports,
    ...Object.values(globals),
  );
  return mod.exports;
}

function simulate(refreshRate, physicsRate, stall = false) {
  const saved = { ...settings.data };
  const callbacks = [];
  let time = 0;
  const Game = load("lib/game.js", {
    now: () => time,
    "request-animation-frame": (callback) => callbacks.push(callback),
  });
  settings.data.framerate = physicsRate;
  settings.data.timestep = 1000 / physicsRate;
  settings.data.unitSpeed = settings.data.defaultUnitSpeed * (60 / physicsRate);
  const game = new Game("game");
  const world = game.world;
  try {
    puppeteer.namespace("single").goto(world, 3);
    world.me = world.players.a;
    world.opponent = world.players.b;
    world.players.a.paddle = actions.createPaddle(world, world.players.a);
    world.players.b.paddle = actions.createPaddle(world, world.players.b);
    actions.createShields(world, world.players.a);
    actions.createShields(world, world.players.b);
    actions.createPuckCenter(world);
    world.setState("playing");
    game.on("pre update", puppeteer.update);
    game.on("pre update", (world) => {
      // Input is tied to physics ticks, as it is in normal play.
      actions.movePaddle(world, world.me.paddle, Math.sin(world.frame / 20));
    });
    const timesteps = [];
    const frames = [];
    game.on("update", (world, step) => timesteps.push(step));
    game.on("render", (world, alpha, delta) => frames.push({ alpha, delta }));
    game.run();
    const count = stall ? 1 : refreshRate * 2;
    for (let i = 1; i <= count; i++) {
      // End just past two seconds to avoid rounding on an exact tick boundary.
      time = stall ? 5000 : (i * 2001) / count;
      assert.equal(callbacks.length, 1);
      callbacks.shift()();
    }
    assert.equal(frames.length, count + 1);
    assert.ok(frames.every((frame) => frame.alpha >= 0 && frame.alpha < 1));
    assert.ok(frames.every((frame) => Number.isFinite(frame.delta)));
    assert.ok(timesteps.every((step) => step === 1000 / physicsRate));
    assert.equal(
      world.frame,
      stall ? settings.data.maxUpdatesPerFrame : physicsRate * 2,
    );
    return JSON.parse(JSON.stringify(world));
  } finally {
    game.running = false;
    world.reset();
    inputs.reset();
    Object.assign(settings.data, saved);
  }
}

for (const physicsRate of [60, 30]) {
  test(
    "physics stays identical at different display rates (" +
      physicsRate +
      " Hz)",
    () => {
      const baseline = simulate(60, physicsRate);
      for (const refreshRate of [30, 120, 144, 240])
        assert.deepEqual(simulate(refreshRate, physicsRate), baseline);
    },
  );
}

test("a stalled display still respects the physics catch-up limit", () => {
  simulate(240, 60, true);
});

const Player = load("lib/renderer-3d/player.js", {
  "./materials": {},
  "./shaders": {},
  "./effect-skins": {},
});
test("3D paddles interpolate between physics ticks without mutating the body", () => {
  const body = {
    previous: [100, 200],
    current: [140, 240],
    offset: [5, -5],
    aabb: [0, 200, 0, 0],
  };
  const snapshot = structuredClone(body);
  const player = {
    paddle: { position: {}, scale: { x: 2 } },
    resizeSkin: { isActive: false },
  };
  for (const alpha of [0, 0.25, 0.5, 0.75]) {
    Player.prototype.updatePaddle.call(player, body, alpha, 1000 / 240);
    assert.equal(
      player.paddle.position.x,
      100 + 40 * alpha + 5 - settings.data.arenaWidth / 2,
    );
    assert.equal(
      player.paddle.position.z,
      200 + 40 * alpha - 5 - settings.data.arenaHeight / 2,
    );
  }
  assert.deepEqual(body, snapshot);
});

test("paddle easing and visual clocks retain their speed at higher refresh rates", () => {
  const positions = [];
  for (const refreshRate of [60, 120, 144, 240]) {
    const player = { paddle: { position: { x: 100 } } };
    let elapsed = 0;
    for (let i = 0; i < refreshRate; i++) {
      Player.prototype.paddleToCenterUpdate.call(player, 1000 / refreshRate);
      elapsed += renderTime.scale(1000 / refreshRate);
    }
    assert.ok(Math.abs(elapsed - 60) < 1e-9);
    positions.push(player.paddle.position.x);
  }
  assert.ok(positions.every((x) => Math.abs(x - positions[0]) < 1e-9));
  assert.equal(renderTime.scale(), 1);
  assert.equal(renderTime.scale(0), 0);
  assert.equal(renderTime.delta(5000), 100);
});

test("CSS bear animations retain their cadence on fast displays", () => {
  const Bear = require("../lib/renderer-css/bear");
  const snapshots = [];
  for (const refreshRate of [60, 120, 144, 240]) {
    const element = { style: {}, setAttribute() {} };
    const bear = new Bear(element);
    for (let i = 0; i < refreshRate * 3; i++)
      bear.render({}, 1000 / refreshRate);
    snapshots.push({
      index: bear.index,
      expression: bear.expression,
      style: element.style,
    });
  }
  for (const snapshot of snapshots) assert.deepEqual(snapshot, snapshots[0]);
});

test("puck and shield RAF animations keep their duration on fast displays", () => {
  const globals = {
    THREE: {
      CubeGeometry: class {},
      BoxGeometry: class {
        applyMatrix() {}
      },
      Matrix4: class {
        translate() {
          return this;
        }
      },
      Vector3: class {},
    },
  };
  for (const refreshRate of [60, 120, 144, 240]) {
    for (const type of ["puck", "shield"]) {
      let time = 0;
      const callbacks = [];
      const Visual = load(
        "lib/renderer-3d/" + type + ".js",
        {
          now: () => time,
          "request-animation-frame": (callback) => callbacks.push(callback),
          "../support/pool": () => {},
          "./materials": {},
        },
        globals,
      );
      const visual = Object.create(Visual.prototype);
      visual.mesh = { scale: { y: type === "puck" ? 0.01 : 1 }, material: {} };
      if (type === "puck") visual.scaleTo(1);
      else visual.animateOut();
      // Five reference frames plus the immediate first animation step. Stop
      // before either effect snaps to its endpoint to compare actual motion.
      for (let i = 1; i <= refreshRate / 12; i++) {
        time = (i * 1000) / refreshRate;
        assert.equal(callbacks.length, 1);
        callbacks.shift()();
      }
      const expected =
        type === "puck"
          ? 1 - 0.99 * Math.pow(0.5, 6)
          : 0.01 + 0.99 * Math.pow(0.9, 6);
      assert.ok(Math.abs(visual.mesh.scale.y - expected) < 1e-9);
      if (type === "shield")
        assert.ok(
          Math.abs(visual.mesh.material.opacity - Math.pow(0.9, 6)) < 1e-9,
        );
    }
  }
});
