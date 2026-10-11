"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createHmac } = require("node:crypto");
const { once } = require("node:events");
const { WebSocket } = require("ws");
const { createApp } = require("../server");
async function setup(t, options) {
  const app = createApp(options);
  app.server.listen(0, "127.0.0.1");
  await once(app.server, "listening");
  const base = "http://127.0.0.1:" + app.server.address().port;
  t.after(async () => {
    for (const ws of app.wss.clients) ws.terminate();
    app.server.closeAllConnections();
    await new Promise((resolve) => app.server.close(resolve));
  });
  return { ...app, base };
}
function messages(ws) {
  const queue = [],
    waiting = [];
  ws.on("message", (data) => {
    const value = JSON.parse(data);
    if (waiting.length) waiting.shift()(value);
    else queue.push(value);
  });
  return () =>
    queue.length
      ? Promise.resolve(queue.shift())
      : new Promise((resolve, reject) => {
          const timer = setTimeout(
            () => reject(new Error("Signal timed out")),
            3000,
          );
          waiting.push((value) => {
            clearTimeout(timer);
            resolve(value);
          });
        });
}
async function join(base, room) {
  const ws = new WebSocket(base.replace("http", "ws") + "/signal?room=" + room);
  const next = messages(ws);
  await once(ws, "open");
  return { ws, next };
}
test("serves built application and assets without hosted dependencies", async (t) => {
  const { base } = await setup(t);
  const response = await fetch(base + "/?play", { redirect: "manual" });
  assert.equal(response.status, 302);
  assert.match(response.headers.get("location"), /^\/[a-f0-9]+\?play$/);
  const page = await fetch(base + "/sample", {
    headers: { "Accept-Language": "en'</script><script>alert(1)</script>" },
  });
  const html = await page.text();
  assert.equal(page.status, 200);
  assert.match(html, /window.ctx/);
  assert.ok(!html.includes("en'</script>"));
  assert.doesNotMatch(
    html,
    /google-analytics|fonts.googleapis|_ah\/channel|manifest.appcache|plus.google/,
  );
  for (const file of [
    "/javascript/slam.js",
    "/javascript/renderer-3d.js",
    "/stylesheets/slam.css",
    "/lang/en-US.arb",
    "/lang/sv.arb",
    "/images/logo_large.png",
    "/tech",
    "/privacy",
    "/healthz",
  ]) {
    const asset = await fetch(base + file);
    assert.equal(asset.status, 200, file);
    await asset.arrayBuffer();
  }
  assert.equal((await fetch(base + "/javascript/not-found.js")).status, 404);
  assert.equal((await fetch(base + "/%2e%2e%2fpackage.json")).status, 404);
  assert.equal((await fetch(base + "/%00")).status, 400);
  assert.equal((await fetch(base + "/sample", { method: "POST" })).status, 405);
});
test("pairs two peers, forwards signaling, rejects a third and cleans empty rooms", async (t) => {
  const { base, rooms } = await setup(t);
  const a = await join(base, "pair");
  const b = await join(base, "pair");
  assert.deepEqual(await a.next(), { type: "connected", initiator: true });
  assert.deepEqual(await b.next(), { type: "connected", initiator: false });
  a.ws.send(JSON.stringify({ type: "offer", sdp: "sample offer" }));
  assert.deepEqual(await b.next(), { type: "offer", sdp: "sample offer" });
  b.ws.send(
    JSON.stringify({ type: "candidate", candidate: { candidate: "ice" } }),
  );
  assert.equal((await a.next()).type, "candidate");
  const c = await join(base, "pair");
  assert.equal((await c.next()).type, "full");
  await once(c.ws, "close");
  const page = await (await fetch(base + "/pair")).text();
  assert.match(page, /body class="room-full"/);
  b.ws.close();
  await once(b.ws, "close");
  assert.equal((await a.next()).type, "disconnected");
  assert.equal(rooms.get("pair").size, 1);
  const replacement = await join(base, "pair");
  assert.equal((await a.next()).initiator, true);
  assert.equal((await replacement.next()).initiator, false);
  replacement.ws.close();
  await once(replacement.ws, "close");
  await a.next();
  a.ws.close();
  await once(a.ws, "close");
  assert.equal(rooms.size, 0);
});
test("rejects foreign origins, invalid rooms, malformed signals and room exhaustion", async (t) => {
  const { base } = await setup(t, { maxRooms: 1 });
  for (const [room, origin] of [
    ["valid", "http://example.invalid"],
    ["bad%2Froom", undefined],
  ]) {
    const ws = new WebSocket(
      base.replace("http", "ws") + "/signal?room=" + room,
      origin ? { origin } : {},
    );
    const [error] = await once(ws, "error");
    assert.match(error.message, /403/);
  }
  const a = await join(base, "first");
  const extra = new WebSocket(
    base.replace("http", "ws") + "/signal?room=second",
  );
  const [error] = await once(extra, "error");
  assert.match(error.message, /503/);
  a.ws.send("{");
  const [code] = await once(a.ws, "close");
  assert.equal(code, 1008);
});
test("exposes explicitly configured ICE servers with no vendor defaults", async (t) => {
  const iceServers = [
    { urls: "turn:relay.example.org", username: "guest", credential: "test" },
  ];
  const { base } = await setup(t, { iceServers });
  assert.deepEqual(await (await fetch(base + "/api/config")).json(), {
    iceServers,
  });
});

test("issues expiring coturn credentials without disclosing the shared secret", async (t) => {
  const turnSecret = "local-test-secret";
  const turnURLs = ["turn:relay.example.org:3478"];
  const { base } = await setup(t, { turnURLs, turnSecret });
  const response = await fetch(base + "/api/config");
  assert.equal(response.headers.get("cache-control"), "no-store");
  const result = await response.json();
  const [relay] = result.iceServers;
  assert.deepEqual(relay.urls, turnURLs);
  const expiry = Number(relay.username.split(":")[0]);
  assert.ok(
    expiry > Math.floor(Date.now() / 1000) + 3500 &&
      expiry <= Math.floor(Date.now() / 1000) + 3600,
  );
  assert.equal(
    relay.credential,
    createHmac("sha1", turnSecret).update(relay.username).digest("base64"),
  );
  assert.ok(!JSON.stringify(result).includes(turnSecret));
});
