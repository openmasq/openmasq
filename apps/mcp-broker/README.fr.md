# @openmasq/mcp-broker

[English](README.md)

**Un serveur MCP local qui se connecte à Gmail, Slack et GitHub pour vous et garde leurs jetons.**

Le broker est un serveur Express. Il héberge un serveur MCP Streamable HTTP par plateforme
(Gmail, Slack, GitHub, et une démo qui n'a besoin d'aucun identifiant) et sert de serveur
d'autorisation OAuth 2.1, fédéré vers la connexion de chaque fournisseur. Un client MCP se
connecte à une URL par plateforme et s'authentifie par l'intermédiaire du broker. Le jeton
d'accès du fournisseur reste dans le broker : le client ne reçoit que la sortie des outils. Il
n'écoute que sur `127.0.0.1`.

```
client ──OAuth (DCR + PKCE)──▶ broker ──fédère──▶ connexion Google / Slack / GitHub
client ──Bearer jeton broker──▶ broker /<plateforme>/mcp ──API du fournisseur──▶ outils
```

## Prise en main

Nécessite Node.js 20 ou plus récent.

```bash
pnpm --filter @openmasq/mcp-broker smoke    # parcours de démo de bout en bout, sans identifiants
pnpm --filter @openmasq/mcp-broker dev      # tsx watch, http://localhost:8787
pnpm --filter @openmasq/mcp-broker build    # tsc → dist/
pnpm --filter @openmasq/mcp-broker start    # node dist/index.js
```

`smoke` enregistre un client, déroule à la main l'autorisation et l'échange de jeton, vérifie
qu'un vérificateur PKCE rejoué est refusé, puis appelle un outil de démo avec un vrai client
MCP. Les tests unitaires OAuth (PKCE, URI de redirection, stockage, chiffrement au repos)
tournent avec le `pnpm test` de la racine.

## Configuration

Le broker lit ses réglages dans des variables d'environnement, uniquement dans
[`src/config.ts`](src/config.ts). Il ne charge pas de fichier `.env`.

| Variable | Défaut | Description |
|---|---|---|
| `PORT` | `8787` | Port d'écoute, sur `127.0.0.1` |
| `PUBLIC_URL` | `http://localhost:8787` | Émetteur et base de chaque URI de redirection |
| `BROKER_DATA_DIR` | vide | Dossier du fichier de jetons chiffré. Vide : tout reste en mémoire. |
| `BROKER_ENCRYPTION_KEY` | vide | Clé de 32 octets, en hexadécimal ou en base64. Vide : un fichier de clé est créé à côté des données. |
| `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET` | vide | Active Gmail |
| `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET` | vide | Active Slack |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | vide | Active GitHub |
| `BROKER_FORCE_LISTEN` | vide | Écoute même si le fichier n'est pas le point d'entrée (posée par l'application de bureau) |

## Plateformes

La plateforme de démo est toujours active. Une vraie plateforme s'active dès que son
`*_CLIENT_ID` est défini. Créez l'application OAuth avec l'URI de redirection
`${PUBLIC_URL}/oauth/callback/<plateforme>`.

| Plateforme | Portées | Outils | Application OAuth |
|---|---|---|---|
| `demo` | aucune | `list_recent_senders`, `echo` (données fictives) | aucune |
| `gmail` | `gmail.readonly` | `search_messages`, `list_recent_senders` | console Google Cloud |
| `slack` | `channels:read`, `search:read` | `list_channels`, `search_messages` | api.slack.com/apps |
| `github` | `repo`, `read:user` | `list_repos`, `list_issues` | github.com/settings/developers |

> [!NOTE]
> Le secret client est facultatif. Sans secret, le broker se comporte en client public et
> ajoute son propre PKCE côté fournisseur. Un secret livré avec une application de bureau n'est
> pas vraiment secret : c'est la position habituelle des applications natives (RFC 8252).

## Points d'accès

| Route | Rôle |
|---|---|
| `GET /healthz` | Disponibilité |
| `GET /platforms` | Plateformes actives, chacune avec son `mcpUrl` |
| `GET /.well-known/oauth-authorization-server` | Métadonnées du serveur d'autorisation (RFC 8414) |
| `GET /:platform/.well-known/oauth-protected-resource` | Métadonnées de la ressource protégée (RFC 9728) |
| `POST /oauth/register` | Enregistrement dynamique de client (RFC 7591) |
| `GET /oauth/authorize` | Lance la connexion. La démo consent aussitôt ; les vraies plateformes redirigent vers le fournisseur. |
| `GET /oauth/callback/:platform` | Retour du fournisseur : échange le code et garde les jetons du fournisseur |
| `POST /oauth/token` | Octrois `authorization_code` et `refresh_token` |
| `GET`, `POST`, `DELETE /:platform/mcp` | Le point d'accès MCP, derrière un jeton broker en Bearer |

Une requête vers `/:platform/mcp` sans jeton valide reçoit un `401` dont l'en-tête
`WWW-Authenticate` désigne les métadonnées de la ressource : un client MCP peut ainsi découvrir
le broker et lancer le parcours OAuth. Chaque requête construit un serveur MCP neuf, sans état,
lié à ce jeton.

## Avec l'application de bureau

L'application de bureau lance le broker comme processus annexe
([`apps/desktop/src/main/broker.ts`](../desktop/src/main/broker.ts)) quand elle trouve un build
dans `apps/mcp-broker/dist/index.js` : lancez donc `build` d'abord. Elle choisit un port libre
en boucle locale, fixe `BROKER_DATA_DIR` à `<userData>/broker`, attend `/healthz`, puis expose
l'URL et les plateformes par IPC (`mcp:broker`).

> [!IMPORTANT]
> Le processus annexe reçoit un environnement filtré par liste d'autorisation
> ([`apps/desktop/src/main/childEnv.ts`](../desktop/src/main/childEnv.ts)) : les variables
> `*_CLIENT_ID` de votre shell ne l'atteignent pas, il n'expose donc que la plateforme de démo.
> Les connecteurs Google et Microsoft de l'application tournent dans le processus, avec un OAuth
> sur l'appareil, et n'utilisent pas le broker. Le formulaire de connecteur personnalisé de
> **Réglages → Connecteurs** n'accepte que des adresses `https://` publiques : le broker local
> ne peut pas y être ajouté.

## Sécurité

| Propriété | Comportement |
|---|---|
| **PKCE** | `S256` uniquement. Un défi absent ou `plain` est refusé. |
| **URI de redirection** | Les URI en boucle locale (`127.0.0.1`, `::1`, `localhost`) sont comparées sans tenir compte du port (RFC 8252). Toutes les autres doivent correspondre à l'identique. |
| **Codes d'autorisation** | À usage unique, valables 60 s. |
| **Jetons du broker** | Aléatoires sur 256 bits, valables 1 heure. Un jeton de rafraîchissement est à usage unique et change à chaque rafraîchissement. |
| **Jetons du fournisseur** | Jamais envoyés au client. Les corps d'erreur du fournisseur ne sont pas transmis : les outils voient un statut et une raison courte. |
| **Identifiants du fournisseur** | Lus dans l'environnement, uniquement dans `src/config.ts`, jamais journalisés. |
| **Au repos** | Clients et jetons enregistrés dans `tokens.enc`, en AES-256-GCM. La clé est `BROKER_ENCRYPTION_KEY` ou un fichier `key` écrit en mode 0600. Les connexions en cours et les codes restent en mémoire. |
| **Limite de débit** | `/oauth/token` : 30 requêtes par minute et par IP. |
| **Réseau** | Écoute sur `127.0.0.1`. Le CORS est ouvert pour que les clients MCP de navigateur puissent l'atteindre ; chaque route MCP exige un jeton Bearer. |

> [!WARNING]
> Limites actuelles : les jetons du fournisseur ne sont pas rafraîchis automatiquement à leur
> expiration. Le serveur d'autorisation est écrit pour le client du SDK MCP, pas comme un
> serveur généraliste. Le fichier de clé est rangé à côté des données qu'il protège : il
> protège des sauvegardes et des lectures fortuites, pas de quelqu'un qui a accès à votre
> compte. Sous Windows, le mode 0600 n'est pas appliqué : passez `BROKER_ENCRYPTION_KEY`. Un
> déploiement hébergé demanderait un stockage chiffré partagé.

Pour contribuer : [`CLAUDE.md`](CLAUDE.md) décrit le code source et le parcours OAuth.
