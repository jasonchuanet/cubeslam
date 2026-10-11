"use strict";
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { randomBytes, createHmac } = require("node:crypto");
const { WebSocketServer, WebSocket } = require("ws");
const root = path.resolve(__dirname, "..");
const mime = {
  ".js": "text/javascript",
  ".css": "text/css",
  ".html": "text/html",
  ".json": "application/json",
  ".arb": "text/javascript",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".xml": "application/xml",
};
const json = (value) => JSON.stringify(value).replace(/</g, "\\u003c");
function createApp({
  iceServers = [],
  maxRooms = 1000,
  turnURLs = [],
  turnSecret = "",
} = {}) {
  const rooms = new Map();
  const template = fs.readFileSync(path.join(root, "build/build.html"), "utf8");
  const tech = fs.readFileSync(path.join(root, "build/tech.html"), "utf8");
  const server = http.createServer((req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    const url = new URL(req.url, "http://localhost");
    if (!["GET", "HEAD"].includes(req.method)) {
      res.writeHead(405);
      return res.end();
    }
    if (url.pathname === "/healthz") {
      res.setHeader("Content-Type", "application/json");
      return res.end('{"status":"ok"}');
    }
    if (url.pathname === "/api/config") {
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-store");
      const servers = iceServers.slice();
      if (turnURLs.length && turnSecret) {
        const username =
          Math.floor(Date.now() / 1000) +
          3600 +
          ":" +
          randomBytes(8).toString("hex");
        servers.push({
          urls: turnURLs,
          username,
          credential: createHmac("sha1", turnSecret)
            .update(username)
            .digest("base64"),
        });
      }
      return res.end(json({ iceServers: servers }));
    }
    if (url.pathname === "/") {
      res.writeHead(302, {
        Location: "/" + randomBytes(9).toString("hex") + url.search,
      });
      return res.end();
    }
    if (
      url.pathname === "/tech" ||
      (/^\/[a-zA-Z0-9_-]{1,64}$/.test(url.pathname) &&
        url.pathname !== "/privacy")
    ) {
      const room = url.pathname.slice(1);
      const occupants = rooms.get(room)?.size || 0;
      const data = {
        Room: room,
        State:
          occupants >= 2
            ? "room-full"
            : occupants
              ? "room-lonely"
              : "room-empty",
        AcceptLanguage: "en-US",
        Dev: "false",
        Version: "2",
        Minified: "",
      };
      let html = (url.pathname === "/tech" ? tech : template).replace(
        /\{\{\.(\w+)\}\}/g,
        (_, key) => data[key] ?? "",
      );
      html = html.replace(
        "__CUBESLAM_CONTEXT__",
        json({
          room,
          acceptLanguage: req.headers["accept-language"] || "en-US",
          ext: ".js?v=2",
          dev: false,
          v: "2",
        }),
      );
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      return res.end(req.method === "HEAD" ? undefined : html);
    }
    let pathname;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      res.writeHead(400);
      return res.end();
    }
    if (pathname.includes("\0")) {
      res.writeHead(400);
      return res.end();
    }
    if (pathname === "/privacy") pathname = "/privacy.html";
    if (pathname === "/favicon.ico") pathname = "/images/favicon.ico";
    const file = path.resolve(root, "public", "." + pathname);
    if (!file.startsWith(path.join(root, "public") + path.sep)) {
      res.writeHead(404);
      return res.end();
    }
    fs.stat(file, (err, stat) => {
      if (err || !stat.isFile()) {
        res.writeHead(404);
        return res.end("Not found");
      }
      res.setHeader(
        "Content-Type",
        mime[path.extname(file)] || "application/octet-stream",
      );
      res.setHeader("Content-Length", stat.size);
      if (req.method === "HEAD") return res.end();
      const stream = fs.createReadStream(file);
      stream.on("error", () => res.destroy());
      stream.pipe(res);
    });
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url, "http://localhost");
    let sameOrigin = true;
    try {
      if (req.headers.origin)
        sameOrigin = new URL(req.headers.origin).host === req.headers.host;
    } catch {
      sameOrigin = false;
    }
    if (
      url.pathname !== "/signal" ||
      !/^[a-zA-Z0-9_-]{1,64}$/.test(url.searchParams.get("room") || "") ||
      !sameOrigin
    ) {
      socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      return;
    }
    const name = url.searchParams.get("room");
    if (!rooms.has(name) && rooms.size >= maxRooms) {
      socket.end(
        "HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n",
      );
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) =>
      wss.emit("connection", ws, name),
    );
  });
  const send = (ws, message) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
  };
  wss.on("connection", (ws, name) => {
    let peers = rooms.get(name);
    if (!peers) rooms.set(name, (peers = new Set()));
    if (peers.size >= 2) {
      send(ws, { type: "full" });
      ws.close(1008, "Room full");
      return;
    }
    peers.add(ws);
    ws.alive = true;
    ws.on("pong", () => {
      ws.alive = true;
    });
    if (peers.size === 2)
      [...peers].forEach((peer, i) =>
        send(peer, { type: "connected", initiator: i === 0 }),
      );
    ws.on("message", (buffer) => {
      let message;
      try {
        message = JSON.parse(buffer);
      } catch {
        ws.close(1008, "Invalid JSON");
        return;
      }
      if (
        !message ||
        !["offer", "answer", "candidate", "state", "meta"].includes(
          message.type,
        )
      ) {
        ws.close(1008, "Invalid signal");
        return;
      }
      // Bound signaling and slow-client buffers; game data travels peer to peer.
      const now = Date.now();
      if (!ws.window || now - ws.window > 1000) {
        ws.window = now;
        ws.count = 0;
      }
      if (++ws.count > 200) {
        ws.close(1008, "Rate limit");
        return;
      }
      for (const peer of peers)
        if (peer !== ws) {
          if (peer.bufferedAmount > 1024 * 1024) peer.terminate();
          else send(peer, message);
        }
    });
    ws.on("error", () => {});
    ws.on("close", () => {
      peers.delete(ws);
      for (const peer of peers) send(peer, { type: "disconnected" });
      if (!peers.size) rooms.delete(name);
    });
  });
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (ws.alive === false) ws.terminate();
      else {
        ws.alive = false;
        ws.ping();
      }
    }
  }, 30000);
  heartbeat.unref();
  server.on("close", () => {
    clearInterval(heartbeat);
    for (const ws of wss.clients) ws.terminate();
    wss.close();
  });
  return { server, rooms, wss };
}
if (require.main === module) {
  const iceServers = JSON.parse(process.env.ICE_SERVERS || "[]");
  if (!Array.isArray(iceServers))
    throw new Error("ICE_SERVERS must be a JSON array");
  const turnURLs = (process.env.TURN_URLS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const turnSecret = process.env.TURN_SECRET || "";
  if (turnURLs.length && !turnSecret)
    throw new Error("TURN_URLS requires TURN_SECRET");
  const { server, wss } = createApp({ iceServers, turnURLs, turnSecret });
  server.listen(Number(process.env.PORT || 8080), "0.0.0.0", () =>
    console.log("Cube Slam listening on port " + server.address().port),
  );
  const stop = () => {
    for (const ws of wss.clients) ws.close(1001, "Server shutting down");
    server.close();
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}
module.exports = { createApp };
