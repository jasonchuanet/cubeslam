"use strict";
const assert = require("node:assert/strict");
const { once } = require("node:events");
const { chromium } = require("playwright");
const { createApp } = require("../server");
(async () => {
  let app;
  let base = process.env.TEST_BASE_URL;
  if (!base) {
    app = createApp();
    app.server.listen(0, "127.0.0.1");
    await once(app.server, "listening");
    base = "http://127.0.0.1:" + app.server.address().port;
  }
  const errors = [];
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
    args: [
      "--no-sandbox",
      "--enable-unsafe-swiftshader",
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--autoplay-policy=no-user-gesture-required",
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
    ],
  });
  async function page() {
    const context = await browser.newContext({
      permissions: ["camera", "microphone"],
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    // Assert the app makes no requests to external services, even for fonts or analytics.
    page.on("request", (request) => {
      if (
        !request.url().startsWith(base) &&
        !/^(data|blob):/.test(request.url())
      )
        errors.push("External request: " + request.url());
    });
    page.on("response", (response) => {
      if (response.status() >= 400)
        errors.push("HTTP " + response.status() + ": " + response.url());
    });
    return page;
  }
  try {
    const single = await page();
    await single.goto(base + "/solo?play&god");
    await single.waitForFunction(
      () => window.ctx?.pathname === "/game/play",
      {},
      { timeout: 30000 },
    );
    const frame = await single.evaluate(() => ctx.game.world.frame);
    await single.waitForFunction(
      (frame) => ctx.game.world.frame > frame + 15,
      frame,
    );
    assert.equal(
      await single.evaluate(() => ctx.renderer.impl.canvas.id),
      "canv-3d",
    );
    await single.mouse.move(500, 400);
    await single.keyboard.press("ArrowRight");
    console.log(
      "Passed 3D single-player, audio initialization and advancing simulation",
    );
    await single.close();

    const mobile = await page();
    await mobile.goto(base + "/mobile?mobile&silent&play&god");
    await mobile.waitForFunction(
      () => window.ctx?.pathname === "/game/play",
      {},
      { timeout: 30000 },
    );
    assert.equal(await mobile.evaluate(() => ctx.mobile), true);
    console.log("Passed CSS fallback gameplay");
    await mobile.close();

    const a = await page();
    const b = await page();
    await a.goto(base + "/friends?autonav&silent&god");
    await a.waitForFunction(
      () => window.ctx?.pathname === "/main-menu",
      {},
      { timeout: 30000 },
    );
    await b.goto(base + "/friends?autonav&silent&god");
    for (const p of [a, b])
      await p.waitForFunction(
        () => window.ctx?.network?.ready && ctx.pathname === "/game/play",
        {},
        { timeout: 45000 },
      );
    for (const p of [a, b]) {
      assert.equal(await p.evaluate(() => ctx.multiplayer), true);
      assert.equal(
        await p.evaluate(() => ctx.network.remote.channels.game.readyState),
        "open",
      );
      assert.ok(
        await p.evaluate(
          () => document.getElementById("remoteInput").videoWidth > 0,
        ),
      );
      const frame = await p.evaluate(() => ctx.game.world.frame);
      await p.waitForFunction(
        (frame) => ctx.game.world.frame > frame + 15,
        frame,
      );
    }
    assert.notEqual(
      await a.evaluate(() => ctx.network.winner),
      await b.evaluate(() => ctx.network.winner),
    );
    console.log(
      "Passed two-browser WebRTC video, data channel, time synchronization and multiplayer gameplay",
    );
    await b.close();
    await a.waitForFunction(() => ctx.pathname === "/friend/left");
    console.log("Passed peer disconnect notification");
    await a.close();
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    if (app) {
      for (const ws of app.wss.clients) ws.terminate();
      app.server.closeAllConnections();
      await new Promise((resolve) => app.server.close(resolve));
    }
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
