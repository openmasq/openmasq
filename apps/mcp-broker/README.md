# @openmasq/mcp-broker — MCP broker

An Express MCP **broker**: it hosts a Streamable-HTTP **MCP server per platform**
(Gmail, Slack, GitHub, + a credential-free **demo**) and is its own **OAuth 2.1
Authorization Server** that **federates** to each provider's login. The desktop
app connects to one URL per platform and authenticates through the broker — the
"Anthropic-held credentials / Composio" model — so the user never registers a
cloud OAuth app or runs a local server. The provider access token stays inside
the broker; only tool output is returned (and the desktop then redacted it).

```
desktop ──OAuth(DCR+PKCE)──▶ broker ──federates──▶ Google/Slack/GitHub login
desktop ──Bearer brokerToken──▶ broker /<platform>/mcp ──provider API──▶ tools
```

## Run

```bash
pnpm --filter @openmasq/mcp-broker dev      # tsx watch (http://localhost:8787)
pnpm --filter @openmasq/mcp-broker build    # tsc → dist/
pnpm --filter @openmasq/mcp-broker start     # node dist/index.js
pnpm --filter @openmasq/mcp-broker smoke     # end-to-end demo flow, no creds
```

Copy `.env.example` → `.env`. The **demo** platform needs nothing. Real platforms
activate only when their `*_CLIENT_ID` / `*_CLIENT_SECRET` are set; create the
OAuth app with redirect URI `${PUBLIC_URL}/oauth/callback/<platform>`:

| Platform | Env | Where |
|---|---|---|
| Gmail | `GMAIL_CLIENT_ID/SECRET` | Google Cloud console (scope `gmail.readonly`) |
| Slack | `SLACK_CLIENT_ID/SECRET` | api.slack.com/apps |
| GitHub | `GITHUB_CLIENT_ID/SECRET` | github.com/settings/developers |

## Endpoints

- `GET /platforms` — available platforms + their `mcpUrl`.
- `GET /healthz`.
- `GET /.well-known/oauth-authorization-server` — AS metadata (RFC 8414).
- `GET /:platform/.well-known/oauth-protected-resource` — resource metadata (RFC 9728).
- `POST /oauth/register` — Dynamic Client Registration (RFC 7591).
- `GET /oauth/authorize` · `GET /oauth/callback/:platform` · `POST /oauth/token`.
- `GET|POST|DELETE /:platform/mcp` — the MCP endpoint (Bearer broker token).

## Connect from the desktop app

Settings → MCP → add an HTTP server with URL `http://localhost:8787/demo/mcp`
(or `/gmail/mcp`, …). The desktop's existing OAuth connector flow discovers the
broker AS, registers, runs PKCE, and connects — then conversations can call the
broker's tools with full redaction.

## Security

PKCE **S256 required**; loopback redirect URIs matched ignoring port (RFC 8252),
all others exact; auth codes single-use with a 60 s TTL; broker tokens are
256-bit crypto-random with a TTL; provider creds come only from env and are never
logged; upstream tokens never leave the broker; `/oauth/token` is rate-limited.

> Scope/simplifications: in-memory stores (swap for Redis/DB in prod); the
> Authorization Server is hand-rolled to satisfy the MCP SDK client (not a full
> general-purpose AS); refresh of **upstream** provider tokens is stored but not
> auto-refreshed on expiry yet. See `CLAUDE.md`.
