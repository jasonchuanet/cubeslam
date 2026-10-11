# Cube Slam

Cube Slam is a browser game you can play against Bob the bear or face-to-face
with a friend. This version runs on your own server with Node.js 24 and Docker.
It requires no Google Cloud account, App Engine SDK, database, hosted signaling
service, remote fonts, or analytics. All game assets are served locally.

## Run with Docker

Install Docker Engine and Docker Compose, then run:

```sh
docker compose up --build -d
docker compose logs -f cubeslam
```

Open port 8080 on the same machine. The default binding is `127.0.0.1`; set
`BIND_ADDRESS=0.0.0.0` to expose development HTTP on your network. The image builds
the app and runs the backend and simulation tests before producing a non-root,
read-only runtime. `GET /healthz` is the health check. Stop with
`docker compose down`.

Click **Play A Bear** for single-player or **Play A Friend** and share the room
URL. A room accepts two players and exists only while they are connected.
Restarting the server disconnects players and clears all rooms. Use one server
instance; multiple replicas need shared signaling and are not supported.

## Public hosting and HTTPS

Camera and microphone access require a secure browser context: localhost or
HTTPS. HTTP on a remote IP address is sufficient for single-player, but browsers
will deny the camera needed for face-to-face multiplayer. Use current Chromium,
Firefox, or Safari with WebRTC enabled; the automated browser suite uses Chromium.

You can put the app behind an existing HTTPS reverse proxy. Preserve the `Host`
header and forward WebSocket upgrades for `/signal` to port 8080. An optional
Caddy configuration handles both WebSockets and automatic TLS:

```sh
# Point this hostname's DNS at your server and open TCP 80/443.
DOMAIN=slam.example.org docker compose -f compose.yaml -f compose.https.yaml up --build -d
```

Caddy retains its TLS certificates in named volumes. The application itself uses
no external service. Caddy's automatic certificate issuance contacts an ACME
certificate authority; you can use your own reverse proxy and certificates.

## Your own STUN/TURN relay

The default `ICE_SERVERS=[]` uses direct peer connections and makes no request
to a third-party STUN or TURN provider. It works when the players' browsers can
reach one another, such as on the same network. Players behind different NATs,
restrictive firewalls, or a browser policy that blocks direct UDP may need TURN.

Run your own [coturn](https://github.com/coturn/coturn) server. A starting
configuration is in `deploy/turnserver.conf.example`; set its public address,
realm and shared secret, and open its listening and relay ports. For networks
that block UDP, configure coturn's TCP or TLS listener as appropriate.

Copy `.env.example` to `.env` and set:

```dotenv
TURN_URLS=turn:turn.example.org:3478?transport=udp,turn:turn.example.org:3478?transport=tcp
TURN_SECRET=the-same-secret-configured-in-coturn
```

The application gives browsers credentials that expire after one hour. It never
sends the shared secret to a browser. This is a guest game: anyone who can access
the app can obtain a temporary relay credential, so restrict access to the app
or relay if you are hosting for a private group. `.env` is ignored by Git and
excluded from Docker builds.

Alternatively, `ICE_SERVERS` accepts a WebRTC JSON array. For example, your own
STUN server can be configured with
`ICE_SERVERS=[{"urls":"stun:turn.example.org:3478"}]`. Credentials placed directly
in `ICE_SERVERS` are sent to browsers; prefer `TURN_SECRET` for authenticated TURN.

## Develop without Docker

Install Node.js 24, then:

```sh
npm ci
npm run build
npm test
npm start
```

`npm run dev` rebuilds assets and watches the server. Run `npm run build` again
when editing browser modules, templates, shaders, styles, or translations.
The Makefile provides `make build`, `make test`, and `make start` wrappers.

The build uses Pug, Stylus and a small CommonJS bundle loader. Component manifests
are retained only as lists of browser modules. Original geometry and timing
helpers are vendored with exact upstream commits and license notices in
`vendor/`; builds do not use the retired Component package manager or fetch Git
branches. The original Three.js renderer and game artwork are retained. Geometry
exports are checked in, so Python 2 is unnecessary.

## Validation

`npm test` exercises HTTP serving, safe context rendering, room pairing and
capacity, signaling, disconnect cleanup and ICE configuration, plus the original
buffer, input, hash, state-machine and frame-scheduler checks. Assertions cause a
nonzero exit on failure.

The optional browser image includes Chromium from signed Debian packages:

```sh
docker build --target browser-tests -t cubeslam-browser-tests .
docker run --rm --shm-size=1g cubeslam-browser-tests
```

This suite starts its own server, checks 3D single-player with audio startup, CSS
fallback gameplay, and two browsers exchanging WebRTC video and game data. It
also checks disconnect handling and that the app makes no external requests.
For a locally installed Chromium, use
`CHROMIUM_EXECUTABLE_PATH=/path/to/chromium npm run test:browser` after building.
`TEST_BASE_URL` can point the suite at a running instance. Real camera hardware,
other browser engines, and public NAT/TURN connectivity must be checked on your
deployment's network.

## Useful query options

Share the full URL so both players use the same game settings.

- `?play` starts single-player immediately.
- `?silent` skips audio loading.
- `?mobile` forces the CSS fallback.
- `?autonav` advances multiplayer prompts automatically, useful for testing.
- `?dev` opens game settings and debug controls.
- `?quality=low`, `high`, `best`, or `mobile` changes graphics quality.
- `?lang=sv` selects a translation.
- `?round=3`, `?level=2`, `?extras=multiball`, or `?god` adjusts gameplay.

The old `signal=ws` and App Engine options are obsolete; all signaling uses the
same server as the page. The `/privacy` page describes this version's data flow.

## License

Cube Slam is licensed under the [MIT License](LICENSE). The original
[package.json](https://github.com/jasonchuanet/cubeslam/blob/2fca60d911cb5b02786aeb24c9a789f555047378/package.json)
declares `"license": "MIT"`; the original project is also preserved in the
[Google Code archive](https://code.google.com/archive/p/cubeslam/).
Bundled third-party code retains its own license notices, including those in
`vendor/` and the Apache-2.0 notice in `lib/arb.js`.
