// Tick schedules named actions by simulation frame, independent of wall time.
const assert = require("node:assert/strict");
const Tick = require("../lib/support/tick");
const actions = require("../lib/actions");
const tick = new Tick();
const world = { frame: 0 };
const calls = [];
actions.testTick = (w, value) => calls.push([w.frame, value]);
function advance(frames) {
  for (let i = 0; i < frames; i++) {
    world.frame++;
    tick.update(world);
  }
}

tick.setTimeout("testTick", 200, "timeout");
tick.update(world);
advance(11);
assert.equal(calls.length, 0);
advance(1);
assert.deepEqual(calls, [[12, "timeout"]]);
advance(1);
assert.equal(calls.length, 1);

const canceled = tick.setTimeout("testTick", 100, "canceled before update");
tick.clearTimeout(canceled);
tick.update(world);
advance(6);
assert.equal(calls.length, 1);
const pending = tick.setTimeout("testTick", 100, "canceled after update");
tick.update(world);
tick.clearTimeout(pending);
advance(6);
assert.equal(calls.length, 1);

const start = world.frame;
const interval = tick.setInterval("testTick", 100, "interval");
tick.update(world);
advance(18);
assert.deepEqual(calls.slice(1), [
  [start + 6, "interval"],
  [start + 12, "interval"],
  [start + 18, "interval"],
]);
tick.clearInterval(interval);
advance(6);
assert.equal(calls.length, 4);

tick.nextFrame("testTick", "next frame");
tick.update(world);
assert.deepEqual(calls.at(-1), [world.frame, "next frame"]);
tick.setTimeout("testTick", 100, "reset");
tick.reset();
advance(12);
assert.equal(calls.length, 5);
delete actions.testTick;
