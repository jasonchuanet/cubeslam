# Self-hosting

Start with the Docker Compose instructions in the [README](../README.md).
Use one app instance: rooms are held in memory and are cleared on restart;
multiple replicas need shared signaling and are not supported.

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
DOMAIN=slam.example.org docker compose -f compose.yaml -f compose.https.yaml up -d
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
configuration is in [deploy/turnserver.conf.example](../deploy/turnserver.conf.example); set its public address,
realm and shared secret, and open its listening and relay ports. For networks
that block UDP, configure coturn's TCP or TLS listener as appropriate.

Copy [.env.example](../.env.example) to `.env` and set:

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

