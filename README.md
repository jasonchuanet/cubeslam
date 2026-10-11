# Cube Slam

Cube Slam is a browser game you can play against Bob the bear or face-to-face
with a friend. This self-hosted version of the original
[Cube Slam](https://code.google.com/archive/p/cubeslam/) runs on your own server.

The app uses JavaScript, Three.js/WebGL with a CSS fallback, and WebRTC for video
and multiplayer game data. A Node.js 24 server serves the assets and handles
WebSocket signaling; Pug and Stylus build the templates and styles. No cloud
account or database is required.

## Get started

Install Docker Engine and Docker Compose, then:

```sh
git clone https://github.com/jasonchuanet/cubeslam.git
cd cubeslam
docker compose pull
docker compose up -d
```

Open [localhost:8080](http://localhost:8080). Choose **Play A Bear** for
single-player or **Play A Friend** and share the room URL for multiplayer.
Compose uses the public `ghcr.io/jasonchuanet/cubeslam:latest` image, available for
AMD64 and ARM64.

```sh
docker compose logs -f cubeslam  # View logs
docker compose down            # Stop the app
```

## Host for friends

The default port is bound to localhost. Camera and microphone access require
HTTPS when hosting remotely. The [self-hosting guide](docs/self-hosting.md)
covers the included Caddy HTTPS configuration, network settings, and an optional
TURN relay for players behind restrictive networks. Copy [.env.example](.env.example)
to `.env` to customize settings.

Rooms are held in memory: restarting the server disconnects players. Run one app
instance.

## Develop and contribute

Install Node.js 24, then run:

```sh
npm ci
npm run build
npm test
npm start
```

Rebuild assets with `npm run build` after frontend changes. The
[development guide](docs/development.md) covers local Docker builds, browser tests,
and debugging options. Contributions are welcome: describe the change, include
steps to reproduce bugs, and run the relevant tests before submitting a pull
request.

## License

[MIT](LICENSE). Bundled third-party code retains its own license notices.
