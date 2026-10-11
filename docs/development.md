# Development

## Run with Node.js

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

## Build a local Docker image

The default Compose file runs the published GHCR image. To build and run your
checkout instead, apply the development override:

```sh
docker compose -f compose.yaml -f compose.build.yaml up --build -d
```

The Docker build runs backend and simulation tests before producing the runtime
image. `make docker` runs the same command.

## Validation

`npm test` exercises HTTP serving, safe context rendering, room pairing and
capacity, signaling, disconnect cleanup, ICE configuration and audio cleanup,
plus the original buffer, input, hash, state-machine and frame-scheduler checks.
Assertions cause a nonzero exit on failure.

The optional browser image includes Chromium from signed Debian packages:

```sh
docker build --target browser-tests -t cubeslam-browser-tests .
docker run --rm --shm-size=1g cubeslam-browser-tests
```

This suite starts its own server, checks 3D single-player with audio startup,
scoring and level progression with Gravity Well active on levels 4 and 5, CSS
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

## License provenance

The original [package.json](https://github.com/jasonchuanet/cubeslam/blob/2fca60d911cb5b02786aeb24c9a789f555047378/package.json)
declares `"license": "MIT"`. Bundled third-party code retains its own license
notices, including those in `vendor/` and the Apache-2.0 notice in `lib/arb.js`.
