# @openmasq/mcp-broker

[Français](README.fr.md)

**A local MCP server that signs in to Gmail, Slack and GitHub for you and keeps their tokens.**

The broker is an Express server. It hosts one Streamable HTTP MCP server per platform (Gmail,
Slack, GitHub, and a demo that needs no credentials) and is its own OAuth 2.1 authorization
server, which federates to each provider's login. An MCP client connects to one URL per
platform and signs in through the broker. The provider's access token stays in the broker:
the client only receives tool output. It listens on `127.0.0.1` only.

```
client ──OAuth (DCR + PKCE)──▶ broker ──federates──▶ Google / Slack / GitHub login
client ──Bearer broker token──▶ broker /<platform>/mcp ──provider API──▶ tools
```

## Quick start

Requires Node.js 20 or later.

```bash
pnpm --filter @openmasq/mcp-broker smoke    # end-to-end demo flow, no credentials
pnpm --filter @openmasq/mcp-broker dev      # tsx watch, http://localhost:8787
pnpm --filter @openmasq/mcp-broker build    # tsc → dist/
pnpm --filter @openmasq/mcp-broker start    # node dist/index.js
```

`smoke` registers a client, runs the authorization and the token exchange by hand, checks that
a replayed PKCE verifier is refused, then calls a demo tool through a real MCP client. The pure
OAuth units (PKCE, redirect URIs, store, at-rest crypto) run under the root `pnpm test`.

## Configuration

The broker reads its settings from environment variables, in [`src/config.ts`](src/config.ts)
only. It does not load a `.env` file.

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8787` | Listening port, on `127.0.0.1` |
| `PUBLIC_URL` | `http://localhost:8787` | Issuer and base of every redirect URI |
| `BROKER_DATA_DIR` | empty | Folder for the encrypted token file. Empty keeps everything in memory. |
| `BROKER_ENCRYPTION_KEY` | empty | 32-byte key, hex or base64. Empty generates a key file next to the data. |
| `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET` | empty | Enables Gmail |
| `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET` | empty | Enables Slack |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | empty | Enables GitHub |
| `BROKER_FORCE_LISTEN` | empty | Listen even when the file is not the entry point (set by the desktop) |

## Platforms

The demo platform is always on. A real platform turns on when its `*_CLIENT_ID` is set. Create
the OAuth app with the redirect URI `${PUBLIC_URL}/oauth/callback/<platform>`.

| Platform | Scopes | Tools | OAuth app |
|---|---|---|---|
| `demo` | none | `list_recent_senders`, `echo` (canned data) | none |
| `gmail` | `gmail.readonly` | `search_messages`, `list_recent_senders` | Google Cloud console |
| `slack` | `channels:read`, `search:read` | `list_channels`, `search_messages` | api.slack.com/apps |
| `github` | `repo`, `read:user` | `list_repos`, `list_issues` | github.com/settings/developers |

> [!NOTE]
> The client secret is optional. Without one, the broker acts as a public client and adds its
> own PKCE on the provider leg. A secret shipped with a desktop app is not truly secret, which
> is the usual posture for native apps (RFC 8252).

## Endpoints

| Route | Purpose |
|---|---|
| `GET /healthz` | Liveness |
| `GET /platforms` | Enabled platforms, each with its `mcpUrl` |
| `GET /.well-known/oauth-authorization-server` | Authorization server metadata (RFC 8414) |
| `GET /:platform/.well-known/oauth-protected-resource` | Protected resource metadata (RFC 9728) |
| `POST /oauth/register` | Dynamic client registration (RFC 7591) |
| `GET /oauth/authorize` | Starts the login. The demo consents at once; real platforms redirect to the provider. |
| `GET /oauth/callback/:platform` | Provider callback: exchanges the code, keeps the provider tokens |
| `POST /oauth/token` | `authorization_code` and `refresh_token` grants |
| `GET`, `POST`, `DELETE /:platform/mcp` | The MCP endpoint, behind a broker bearer token |

A request to `/:platform/mcp` without a valid token gets a `401` whose `WWW-Authenticate`
header points at the resource metadata, so an MCP client can discover the broker and start the
OAuth flow. Each request builds a fresh, stateless MCP server bound to that token.

## With the desktop app

The desktop app starts the broker as a sidecar
([`apps/desktop/src/main/broker.ts`](../desktop/src/main/broker.ts)) when it finds a build at
`apps/mcp-broker/dist/index.js`, so run `build` first. It picks a free loopback port, sets
`BROKER_DATA_DIR` to `<userData>/broker`, waits for `/healthz`, and exposes the URL and the
platforms over IPC (`mcp:broker`).

> [!IMPORTANT]
> The sidecar receives an allow-listed environment
> ([`apps/desktop/src/main/childEnv.ts`](../desktop/src/main/childEnv.ts)): `*_CLIENT_ID`
> variables from your shell do not reach it, so it only exposes the demo platform. The app's
> own Google and Microsoft connectors run in-process with on-device OAuth and do not use the
> broker. The custom connector form in **Settings → Connectors** accepts only public `https://`
> addresses, so the local broker cannot be added there.

## Security

| Property | Behaviour |
|---|---|
| **PKCE** | `S256` only. A missing challenge or `plain` is refused. |
| **Redirect URIs** | Loopback URIs (`127.0.0.1`, `::1`, `localhost`) match ignoring the port (RFC 8252). Any other URI must match exactly. |
| **Authorization codes** | Single use, valid 60 s. |
| **Broker tokens** | 256-bit random, valid 1 hour. A refresh token is single use and rotates on every refresh. |
| **Provider tokens** | Never sent to the client. Provider error bodies are not forwarded: tools see a status and a short reason. |
| **Provider credentials** | Read from the environment in `src/config.ts` only, never logged. |
| **At rest** | Clients and tokens saved in `tokens.enc`, AES-256-GCM. The key is `BROKER_ENCRYPTION_KEY` or a `key` file written with mode 0600. Pending logins and codes stay in memory. |
| **Rate limit** | `/oauth/token`: 30 requests per minute per IP. |
| **Network** | Listens on `127.0.0.1`. CORS is open so browser MCP clients can reach it; every MCP route needs a bearer token. |

> [!WARNING]
> Current limits: provider tokens are not refreshed automatically when they expire. The
> authorization server is written for the MCP SDK client, not as a general-purpose one. The
> key file sits next to the data it protects, so it guards against backups and casual reads,
> not against someone with access to your account. On Windows, mode 0600 is not enforced: pass
> `BROKER_ENCRYPTION_KEY` there. A hosted deployment would need a shared encrypted store.

Contributors: [`CLAUDE.md`](CLAUDE.md) maps the source and the OAuth flow.
