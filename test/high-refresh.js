"use strict";
const assert = require("node:assert/strict");

module.exports = async function highRefresh(page, base) {
  // GSAP captures Date.now when loaded. Supply a controllable clock for these
  // render-only checks; the game's performance.now physics clock stays intact.
  await page.addInitScript(() => {
    const realNow = Date.now;
    Date.now = () => window.__renderTestTime ?? realNow();
  });
  await page.goto(base + "/high-refresh?play&silent&god");
  await page.waitForFunction(
    () =>
      window.ctx?.pathname === "/game/play" &&
      ctx.game.world.state === "playing",
    {},
    { timeout: 30000 },
  );
  const frame = await page.evaluate(() => ctx.game.world.frame);
  await page.keyboard.down("ArrowRight");
  await page.waitForFunction(
    (frame) => ctx.game.world.frame > frame + 5,
    frame,
  );
  await page.evaluate(() => ctx.game.pause());
  await page.keyboard.up("ArrowRight");

  const result = await page.evaluate(() => {
    const renderer = ctx.renderer.impl;
    const materials = require("slam/lib/renderer-3d/materials");
    const Shield = require("slam/lib/renderer-3d/shield");
    const Ghost = require("slam/lib/renderer-3d/effect-skins").ghost;
    const settings = require("slam/lib/settings");
    const world = ctx.game.world;
    const snapshot = JSON.stringify(world);
    const paddle = world.paddles.get(world.me.paddle);
    const samples = [];
    for (const alpha of [0, 0.25, 0.5, 0.75]) {
      ctx.game.render(alpha, 1000 / 240);
      samples.push({
        actual: renderer.players.me.paddle.position.x,
        expected:
          paddle.previous[0] +
          (paddle.current[0] - paddle.previous[0]) * alpha +
          paddle.offset[0] -
          settings.data.arenaWidth / 2,
      });
    }

    const clocks = [];
    for (const hz of [60, 120, 144, 240]) {
      window.__renderTestTime = Date.now();
      const start = window.__renderTestTime;
      ctx.game.render(0, 0);
      const animated = { x: 0 };
      TweenMax.to(animated, 1, { x: 1, ease: Linear.easeNone });
      const shaderTime = materials.me.uniforms.time.value;
      const cpuTime = renderer.time;
      const shield = {
        body: { data: { player: "a", index: 0, bulletproof: 0 } },
        mesh: { scale: { y: 0.01 }, material: { opacity: 0.25 } },
        bulletproof: false,
        targetOpacity: 0.25,
      };
      const shieldWorld = { players: { a: { shields: [1] } } };
      materials.ghost.opacity = 1;
      for (let i = 1; i <= hz / 2; i++) {
        window.__renderTestTime = start + (i * 1000) / hz;
        ctx.game.render((i % (hz / 60)) / (hz / 60), 1000 / hz);
        Shield.prototype.update.call(shield, shieldWorld, 1000 / hz);
        Ghost.prototype.update.call({ isActive: true }, 1000 / hz);
      }
      clocks.push({
        hz,
        tween: animated.x,
        shader: materials.me.uniforms.time.value - shaderTime,
        cpu: renderer.time - cpuTime,
        shield: shield.mesh.scale.y,
        ghost: materials.ghost.opacity,
      });
    }
    return {
      samples,
      clocks,
      tickerFPS: TweenMax.ticker.fps(),
      physicsUnchanged: JSON.stringify(world) === snapshot,
    };
  });
  assert.equal(result.tickerFPS, 0, "Tweens use the game's render loop");
  assert.equal(result.physicsUnchanged, true);
  assert.equal(new Set(result.samples.map((sample) => sample.actual)).size, 4);
  for (const sample of result.samples)
    assert.ok(Math.abs(sample.actual - sample.expected) < 1e-9);
  for (const clock of result.clocks) {
    assert.ok(Math.abs(clock.tween - 0.5) < 0.01, clock.hz + " Hz tween speed");
    assert.ok(Math.abs(clock.shader - 3) < 1e-9, clock.hz + " Hz shader speed");
    assert.ok(Math.abs(clock.cpu - 3) < 1e-9, clock.hz + " Hz character speed");
    assert.ok(
      Math.abs(clock.shield - (1.01 - Math.pow(0.9, 30))) < 1e-9,
      clock.hz + " Hz shield easing",
    );
    assert.ok(
      Math.abs(clock.ghost - Math.pow(0.9, 30)) < 1e-9,
      clock.hz + " Hz ghost fade",
    );
  }
  console.log(
    "Passed 60/120/144/240 Hz render interpolation and animation timing without physics changes",
  );
};
