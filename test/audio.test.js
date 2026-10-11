"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

// Load DMAF's actual sound classes through its module registration API, with
// fake Web Audio nodes so its stop path can be tested without a browser.
function audioFixture(sources) {
  const sandbox = { module: { exports: {} }, console };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "../lib/dmaf.min.js"), "utf8"),
    sandbox,
  );
  const dmaf = sandbox.module.exports;
  const constructors = {};
  const removed = [];
  let sound;
  const engine = {
    context: {
      currentTime: 42,
      destination: {},
      createGainNode: () => ({ connect() {} }),
    },
    registerInstance(type, id, constructor) {
      constructors[id] = constructor;
    },
    getInstance: () => sound,
    sound: { genericPlay: { removeInstance: (id) => removed.push(id) } },
  };
  const dependencies = {
    DMAF: engine,
    Utils: { propIsnt: (key, value) => (node) => node[key] !== value },
    TimeManager: {
      dropPendingArray: (pending) => {
        pending.length = 0;
      },
      checkFunctionTime: (time, fn, pending, context, ...args) =>
        fn.apply(context, args),
    },
    events: { dispatch() {} },
    InstanceManager: {},
    Instance: {},
    Iterator: function () {},
    Assets: {},
  };
  for (const [name, dependency] of Object.entries(dependencies))
    dmaf(name, [], () => dependency);
  dmaf("init", ["sound"], () => () => {});
  dmaf.init();

  sound = new constructors.genericPlay();
  sound.id = "genericPlay";
  sound.instanceId = "force_field";
  sound.init({});
  sound.sounds.push(...sources);
  sound.playing = sources.length > 0;
  for (const pending of [
    sound.pendingPlays,
    sound.pendingStops,
    sound.pendingEvents,
    sound.pendingSoftLoop,
  ])
    pending.push(1);

  const stop = new constructors.soundStop();
  stop.targets = ["force_field"];
  stop.fadeOut = 0;
  stop.init();
  return { sound, stop, removed };
}

for (const event of [
  "force_hide",
  "user_won_round",
  "user_lost_round",
  "user_won_match",
  "user_lost_match",
]) {
  test("stopping Gravity Well audio on " + event, () => {
    const stopped = [];
    const { sound, stop, removed } = audioFixture([
      { noteOff: (time) => stopped.push(time) },
    ]);
    stop.onAction(event, 42000);
    assert.deepEqual(stopped, [42.001]);
    assert.equal(sound.sounds.length, 0);
    assert.equal(sound.playing, false);
    assert.deepEqual(removed, ["force_field"]);
    for (const pending of [
      sound.pendingPlays,
      sound.pendingStops,
      sound.pendingEvents,
      sound.pendingSoftLoop,
    ])
      assert.equal(pending.length, 0);
  });
}

test("stopping multiple audio sources applies their gain fade and tolerates repeats", () => {
  const faded = [];
  const stopped = [];
  const { sound } = audioFixture(
    [0, 1].map((id) => ({
      gain: {
        value: 0.5,
        cancelScheduledValues: (time) => faded.push([id, "cancel", time]),
        setValueAtTime: (value, time) => faded.push([id, "set", value, time]),
        linearRampToValueAtTime: (value, time) =>
          faded.push([id, "ramp", value, time]),
      },
      noteOff: (time) => stopped.push([id, time]),
    })),
  );
  sound.stop(42000, 0.25);
  assert.deepEqual(faded, [
    [1, "cancel", 42],
    [1, "set", 0.5, 42],
    [1, "ramp", 0, 42.25],
    [0, "cancel", 42],
    [0, "set", 0.5, 42],
    [0, "ramp", 0, 42.25],
  ]);
  assert.deepEqual(stopped, [
    [1, 42.251],
    [0, 42.251],
  ]);
  assert.equal(sound.sounds.length, 0);
  assert.equal(sound.playing, false);
  sound.stop(42000);
  assert.equal(stopped.length, 2);
});
