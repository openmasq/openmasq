# @openmasq/mcp-broker — MCP broker

<sub>**English** · [Français](#openmasqmcp-broker--le-broker-mcp)</sub>

An Express MCP **broker**: it hosts a Streamable-HTTP **MCP server per platform**
(Gmail, Slack, GitHub, + a credential-free **demo**) and is its own **OAuth 2.1
Authorization Server** that **federates** to each provider's login. The desktop
app connects to one URL per platform and authenticates through the broker — the
"Anthropic-held credentials / Composio" model — so the user never registers a
cloud OAuth app or runs a local server. The provider access token stays inside
the broker; only tool output is returned (and the desktop then redacts it).

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

> Scope/simplifications: an encrypted local snapshot under `BROKER_DATA_DIR` (in-memory when it is unset); a hosted deployment would swap it for a shared encrypted store; the
> Authorization Server is hand-rolled to satisfy the MCP SDK client (not a full
> general-purpose AS); refresh of **upstream** provider tokens is stored but not
> auto-refreshed on expiry yet. See `CLAUDE.md`.

---

# @openmasq/mcp-broker — le broker MCP

Un **broker** MCP en Express : il héberge un **serveur MCP Streamable-HTTP par plateforme**
(Gmail, Slack, GitHub, plus une **démo** sans identifiants) et est son propre **serveur
d'autorisation OAuth 2.1**, qui **fédère** vers la connexion de chaque fournisseur.
L'application de bureau se connecte à une URL par plateforme et s'authentifie à travers le
broker — le modèle « identifiants détenus par l'éditeur / Composio » — de sorte que
l'utilisateur n'enregistre jamais d'application OAuth dans un cloud ni ne fait tourner de
serveur local. Le jeton d'accès du fournisseur reste dans le broker ; seule la sortie des
outils est renvoyée (et le bureau la masque ensuite).

```
bureau ──OAuth(DCR+PKCE)──▶ broker ──fédère──▶ connexion Google/Slack/GitHub
bureau ──Bearer brokerToken──▶ broker /<plateforme>/mcp ──API du fournisseur──▶ outils
```

## Lancer

```bash
pnpm --filter @openmasq/mcp-broker dev      # tsx watch (http://localhost:8787)
pnpm --filter @openmasq/mcp-broker build    # tsc → dist/
pnpm --filter @openmasq/mcp-broker start     # node dist/index.js
pnpm --filter @openmasq/mcp-broker smoke     # parcours de démo de bout en bout, sans identifiants
```

Copiez `.env.example` vers `.env`. La plateforme **demo** n'a besoin de rien. Les vraies
plateformes ne s'activent que si leurs `*_CLIENT_ID` / `*_CLIENT_SECRET` sont posés ; créez
l'application OAuth avec l'URI de redirection `${PUBLIC_URL}/oauth/callback/<plateforme>` :

| Plateforme | Variables | Où |
|---|---|---|
| Gmail | `GMAIL_CLIENT_ID/SECRET` | console Google Cloud (portée `gmail.readonly`) |
| Slack | `SLACK_CLIENT_ID/SECRET` | api.slack.com/apps |
| GitHub | `GITHUB_CLIENT_ID/SECRET` | github.com/settings/developers |

## Points d'accès

- `GET /platforms` — les plateformes disponibles et leur `mcpUrl`.
- `GET /healthz`.
- `GET /.well-known/oauth-authorization-server` — métadonnées du serveur d'autorisation (RFC 8414).
- `GET /:platform/.well-known/oauth-protected-resource` — métadonnées de la ressource (RFC 9728).
- `POST /oauth/register` — enregistrement dynamique de client (RFC 7591).
- `GET /oauth/authorize` · `GET /oauth/callback/:platform` · `POST /oauth/token`.
- `GET|POST|DELETE /:platform/mcp` — le point d'accès MCP (jeton broker en Bearer).

## S'y connecter depuis l'application de bureau

Réglages → MCP → ajoutez un serveur HTTP d'URL `http://localhost:8787/demo/mcp` (ou
`/gmail/mcp`, …). Le parcours de connecteur OAuth existant du bureau découvre le serveur
d'autorisation du broker, s'enregistre, exécute PKCE et se connecte — les conversations
peuvent ensuite appeler les outils du broker avec le masquage complet.

## Sécurité

PKCE **S256 obligatoire** ; les URI de redirection en loopback sont comparées en ignorant le
port (RFC 8252), toutes les autres à l'identique ; les codes d'autorisation sont à usage
unique avec une durée de vie de 60 s ; les jetons du broker sont aléatoires
cryptographiquement sur 256 bits, avec une durée de vie ; les identifiants de fournisseur ne
viennent que de l'environnement et ne sont jamais journalisés ; les jetons amont ne quittent
jamais le broker ; `/oauth/token` est limité en débit.

> Portée et simplifications : un instantané local chiffré sous `BROKER_DATA_DIR` (en mémoire
> quand elle n'est pas posée) ; un déploiement hébergé l'échangerait contre un stockage
> chiffré partagé ; le serveur d'autorisation est écrit à la main pour satisfaire le client du
> SDK MCP (ce n'est pas un serveur d'autorisation généraliste complet) ; le rafraîchissement
> des jetons **amont** des fournisseurs est stocké mais pas encore automatique à l'expiration.
> Voir `CLAUDE.md`.
