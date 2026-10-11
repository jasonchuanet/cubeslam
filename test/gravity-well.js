"use strict";
const assert = require("node:assert/strict");

module.exports = async function gravityWellScoring(page, base, level) {
  // Keep audio enabled: the freeze is caused by stopping the well's looping
  // sound. God mode prevents unrelated natural goals while we inject DIED
  // inputs through the same path used by a puck scoring in normal play.
  await page.goto(base + "/gravity-well-" + level + "?play&god&level=" + level);
  await page.waitForFunction(
    () =>
      ctx.pathname === "/game/play" &&
      ctx.game.world.state === "playing" &&
      ctx.game.world.forces.length > 0,
    {},
    { timeout: 30000 },
  );
  assert.equal(
    await page.evaluate(() => ctx.renderer.impl.canvas.id),
    "canv-3d",
  );

  let scores = [0, 0];
  // Score for each side, then win the level to cover both round and match
  // transitions while Gravity Well is active (levels 4 and 5 both use it).
  for (const hitPlayer of [1, 0, 1, 1]) {
    const activeWithAudio = await page.evaluate((hitPlayer) => {
      const world = ctx.game.world;
      const actions = require("slam/lib/actions");
      const force = world.forces.values[0];
      if (!force.active) actions.toggleForce(world, force.index);
      if (!require("slam/lib/dmaf.min").hasContext) return false;
      const inputs = require("slam/lib/inputs");
      inputs.record(inputs.types.DIED, hitPlayer, 0.5);
      return force.active;
    }, hitPlayer);
    assert.equal(
      activeWithAudio,
      true,
      "Gravity Well must be active with Web Audio enabled before scoring",
    );
    scores[1 - hitPlayer]++;
    const nextLevel = scores[0] === 3;
    await page.waitForFunction(
      ({ index, scores }) =>
        ctx.pathname === "/game/play" &&
        ctx.game.world.state === "playing" &&
        ctx.game.world.level.index === index &&
        ctx.game.world.players.a.score === scores[0] &&
        ctx.game.world.players.b.score === scores[1],
      {
        index: level - 1 + Number(nextLevel),
        scores: nextLevel ? [0, 0] : scores,
      },
      { timeout: 30000 },
    );
    assert.ok(
      await page.evaluate(() => ctx.game.world.pucks.length > 0),
      "Next round has a ball",
    );
    const frame = await page.evaluate(() => ctx.game.world.frame);
    await page.waitForFunction(
      (frame) => ctx.game.world.frame > frame + 15,
      frame,
    );

    const x = await page.evaluate(
      () => ctx.game.world.paddles.get(ctx.game.world.me.paddle).current[0],
    );
    await page.keyboard.down("ArrowRight");
    try {
      await page.waitForFunction(
        (x) =>
          ctx.game.world.paddles.get(ctx.game.world.me.paddle).current[0] >
          x + 1,
        x,
        { timeout: 5000 },
      );
    } finally {
      await page.keyboard.up("ArrowRight");
    }
  }
  console.log(
    "Passed Gravity Well scoring for both players and progression from level " +
      level,
  );
};
