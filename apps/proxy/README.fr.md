[English](README.md)

# @openmasq/proxy

[![Licence](https://img.shields.io/badge/licence-Apache--2.0-blue)](../../LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-339933)](package.json)

**Masquez les données personnelles avant qu'une requête ne quitte votre machine, pour tout outil qui accepte une adresse de base.**

Le proxy OpenMasq est un point d'accès compatible OpenAI, Anthropic et Gemini sur
`127.0.0.1`. Il fait tourner le même moteur de masquage que l'application de bureau : il
remplace les données personnelles de chaque requête par des substituts, transmet la requête
au fournisseur, puis remet les vraies valeurs dans la réponse. Il s'adresse aux
développeurs qui appellent des modèles depuis un SDK, un agent de code, un notebook ou un
framework (LangChain, le SDK Vercel AI, Continue…) et veulent le masquage sans l'application
de bureau.

Vous gardez votre propre clé d'API. Le proxy transmet les en-têtes de la requête tels quels
et ne stocke aucune clé. Ce qu'il détient, c'est le **coffre** (la table substitut → vraie
valeur), en mémoire, sur cette machine, le temps d'une requête ou d'une session.

## Installation

Le proxy vit dans ce monorepo et n'est pas publié sur npm. Il demande Node.js 20 ou plus
récent et pnpm.

```bash
git clone https://github.com/openmasq/openmasq && cd openmasq
pnpm install
pnpm build                       # compile les paquets de l'espace de travail et le proxy
```

Les commandes ci-dessous l'appellent `openmasq-proxy`, le nom de son `bin`. Depuis la
racine du dépôt, lancez `node apps/proxy/dist/server.js`, ou définissez un alias :

```bash
alias openmasq-proxy="node $PWD/apps/proxy/dist/server.js"
```

## Prise en main

1. Démarrez le proxy. Il écoute sur `http://127.0.0.1:8787`.

   ```bash
   openmasq-proxy                 # ou, depuis les sources : pnpm --filter @openmasq/proxy dev
   ```

2. Pointez votre outil dessus, dans un autre terminal (la touche `c` du proxy copie ces
   lignes) :

   ```bash
   export OPENAI_BASE_URL=http://127.0.0.1:8787/v1
   export ANTHROPIC_BASE_URL=http://127.0.0.1:8787
   export GOOGLE_GEMINI_BASE_URL=http://127.0.0.1:8787
   ```

3. Utilisez l'outil comme d'habitude. Le proxy affiche chaque requête avec les catégories
   masquées et leur nombre, jamais une valeur.

Ou laissez le proxy lancer l'outil pour vous, adresses de base déjà réglées :

```bash
openmasq-proxy -- claude
```

> [!IMPORTANT]
> Le niveau par défaut, `standard`, n'utilise que des règles déterministes. Il masque les
> e-mails, numéros de téléphone, cartes, IBAN, identifiants nationaux et d'entreprise,
> adresses IP, clés et secrets. **Les noms, entreprises, adresses et lieux ne sont pas
> masqués en `standard`.** Passez en `--level renforce` pour ceux-là (voir
> [Niveaux de masquage](#niveaux-de-masquage)).

## Sommaire

- [Fonctionnalités](#fonctionnalités)
- [Comment ça marche](#comment-ça-marche)
- [Niveaux de masquage](#niveaux-de-masquage)
- [Lancer un outil à travers le proxy](#lancer-un-outil-à-travers-le-proxy)
- [Intégrations MCP](#intégrations-mcp)
- [Fichier de configuration](#fichier-de-configuration)
- [Console en direct](#console-en-direct)
- [Terminal](#terminal)
- [Référence](#référence)
- [Sécurité](#sécurité)
- [Développement](#développement)

## Fonctionnalités

- **Trois formats d'API** : OpenAI (Chat Completions, Responses, Embeddings), Anthropic
  (Messages, comptage de jetons) et Gemini (`generateContent`, flux compris).
- **Restauration en flux** : une réponse en flux est restaurée trame par trame. Un
  substitut coupé entre deux morceaux est retenu jusqu'à pouvoir être restauré entier.
- **Appels d'outils** : les arguments des appels d'outils sont restaurés avant que votre
  code ne les exécute, formes encodées dans une URL comprises : l'extérieur reçoit toujours
  la vraie valeur.
- **Les niveaux de l'application** : `standard`, `renforce` et `strict`, avec les mêmes
  catégories, plus des interrupteurs par type, une liste d'exceptions, des termes toujours
  masqués et un fichier de secrets.
- **Modèle local** : les noms, entreprises, adresses et lieux viennent du modèle NER local,
  vérifié par sha256 avant chargement et jamais téléchargé.
- **Outils enveloppés** : `openmasq-proxy -- <outil>` lance un outil avec ses adresses de
  base pointées sur le proxy, et s'arrête quand l'outil se ferme.
- **Intégrations MCP** : avec `--mcp`, le proxy détient vos serveurs MCP et leurs
  identifiants, et l'agent reçoit les mêmes outils, valeurs masquées.
- **Console en direct** : avec `--console`, une page sur la boucle locale montre chaque
  appel et ce qui y a été masqué.
- **Un seul fichier de réglages** : chaque option peut s'écrire une fois dans
  `~/.openmasq/proxy.json`, pour toutes les sessions ou par outil enveloppé.

## Comment ça marche

```
votre outil ──requête──▶ proxy : masquage ──▶ fournisseur ──réponse──▶ proxy : restauration ──▶ votre outil
```

**Ce qui est masqué** : le texte système et utilisateur, l'historique de l'assistant, les
résultats d'outils et les arguments des appels d'outils déjà présents dans l'historique.

**Ce qui est restauré** : le texte de la réponse, et les arguments des appels d'outils
qu'elle contient.

### Routes

Les routes forment une liste d'autorisation. Un `POST` que le proxy ne sait pas masquer
reçoit une réponse `501` et n'est jamais transmis.

| Famille | Routes |
|---|---|
| OpenAI | `POST /v1/chat/completions`, `/v1/responses`, `/v1/embeddings` |
| Anthropic | `POST /v1/messages`, `/v1/messages/count_tokens` |
| Gemini | `POST /v1beta/models/<modèle>:generateContent`, `:streamGenerateContent` (aussi sous `/v1` et `/v1alpha`) |
| Relais simple | `GET`, `HEAD` et `DELETE` ne portent aucun texte et sont relayés tels quels (`GET /v1/models`…) |

- Préfixez une route par `/openai`, `/anthropic` ou `/gemini` pour forcer sa famille.
- Préfixez-la par `/s/<session>` pour utiliser une session nommée (c'est ainsi que chaque
  outil enveloppé reçoit son propre coffre).
- `GET /healthz` indique le niveau, si le modèle est chargé, le mode et si une console en
  direct est servie.

### En-têtes

| En-tête | Sens | Effet |
|---|---|---|
| `x-openmasq-session: <id>` | requête | Réutilise un coffre d'un tour à l'autre : la même valeur reçoit le même substitut. Une session est oubliée après une heure sans requête. |
| `x-openmasq-mode: fake\|token` | requête | Ce que voit le modèle : un substitut crédible (`fake`, par défaut) ou un jeton opaque. |
| `x-openmasq-masked: <nombre>` | réponse | Le nombre de valeurs masquées dans la requête. |

### Ce qu'un substitut conserve

Un substitut garde ce dont le modèle a besoin pour raisonner, si bien que ce qu'il en
déduit reste vrai de la valeur réelle :

- une IP garde sa classe et son voisinage (deux hôtes d'un même /24 restent sur un même /24
  de substitution, et un sous-réseau que le modèle écrit en retour est restauré vers le
  vrai réseau) ;
- un e-mail garde l'extension de son domaine, et des collègues partagent un même domaine de
  substitution ;
- un numéro de téléphone garde son indicatif et sa classe mobile ou fixe ;
- une carte garde son réseau, et un IBAN son pays (il reste valide).

## Niveaux de masquage

```bash
openmasq-proxy --level renforce
```

| Niveau | Ce qui est masqué | Modèle |
|---|---|---|
| `standard` (par défaut) | E-mails, téléphones, cartes, IBAN, identifiants nationaux et d'entreprise, IP, clés d'API et secrets | Aucun. Démarrage immédiat. |
| `renforce` | `standard`, plus les noms, dates de naissance, entreprises, adresses, lieux et `@pseudos` | Requis |
| `strict` | Tout, y compris les chemins de fichiers, les URL et les dates simples | Requis |

> [!WARNING]
> Au-dessus de `standard`, le modèle raisonne sur des substituts : **une réponse au sujet
> d'une personne ou d'une organisation peut différer** de celle qu'il donnerait sur la
> vraie. La carte de démarrage le signale.

- `renforce` épargne les marques célèbres et les personnalités publiques (culture générale,
  pas vos données). `strict` n'épargne rien.
- Les noms des éditeurs eux-mêmes (Anthropic, Claude, OpenAI, ChatGPT, Codex, Google,
  Gemini, GitHub, Copilot) restent en clair à tous les niveaux : le prompt système d'un
  agent de code les cite à chaque appel.
- Les chemins de fichiers ne sont masqués qu'en `strict`. Un chemin est remplacé segment par
  segment, ce qui casse les commandes qu'exécute un agent de code.

Ajustez un niveau avec ces options :

| Option | Effet |
|---|---|
| `--disable email,phone` | Laisse ces types en clair, en plus de ce que le niveau laisse. |
| `--keep Stripe,Canva` | Ne masque jamais ces valeurs exactes. |
| `--always "Groupe Delorme:company,FR76 3000…:iban"` | Masque toujours ces termes, quoi que trouvent les détecteurs (le Coffre de l'application). Types : `name`, `username`, `email`, `phone`, `company`, `address`, `city`, `id`, `card`, `iban`, `ip`, `path`, `dob`, `secret`. Un terme sans type est un `name`. |
| `--secrets-file <chemin>` | Efface toujours les chaînes exactes de ce fichier, une par ligne. |
| `--mode fake\|token` | Ce que voit le modèle à la place d'une valeur. |

### Le modèle local

`renforce` et `strict` exigent le modèle NER local, et le proxy refuse de démarrer sans lui.
Il ne télécharge jamais le modèle. Il charge le paquet de l'application de bureau, produit
par :

```bash
pnpm --filter @openmasq/desktop bake:ner
```

Dans une copie du dépôt, le proxy trouve `apps/desktop/build/ner-models` tout seul.
Ailleurs, passez `--ner <dossier>` (ou `OPENMASQ_NER_DIR`) avec le dossier racine du paquet.
Les poids sont comparés à des empreintes sha256 figées avant qu'onnxruntime ne les lise. Si
le modèle échoue sur une requête, le proxy répond `502` et ne transmet rien.

> [!WARNING]
> `--rules-only` ne fait tourner que les règles déterministes, à n'importe quel niveau : les
> noms, entreprises et lieux ne sont alors pas détectés. Le proxy le rappelle à chaque
> démarrage.

## Lancer un outil à travers le proxy

```bash
openmasq-proxy -- claude
openmasq-proxy --level renforce -- codex
```

Tout ce qui suit `--` est une commande. Le proxy la lance avec `OPENAI_BASE_URL`,
`ANTHROPIC_BASE_URL` et `GOOGLE_GEMINI_BASE_URL` pointées sur lui, lui laisse le terminal,
et s'arrête quand elle se termine. Pendant ce temps, les lignes de requête partent dans
`~/.openmasq/proxy.log` (ou `--log <fichier>`, écrit en 0600 et renouvelé à 4 Mo), et le
résumé s'affiche à la fermeture de l'outil.

```bash
tail -f ~/.openmasq/proxy.log    # dans une seconde fenêtre
```

Un second `-- <outil>` rejoint le proxy déjà lancé, avec son propre coffre, et suit les
réglages de ce proxy. Si vous demandez une vue en direct (`--console` ou `--open`) et que le
proxy en cours n'en a pas, la nouvelle session démarre son propre proxy sur le port libre
suivant et le signale.

**Agents de code.** La configuration par outil, avec ce qui a réellement été testé, se
trouve dans [`examples/README.md`](examples/README.md) :

- **Claude Code** respecte `ANTHROPIC_BASE_URL`.
- **Codex** exige un bloc `model_providers` avec `wire_api = "responses"`. La variable
  `OPENAI_BASE_URL` seule le laisse sur sa connexion ChatGPT enregistrée.
- **Gemini CLI** lit `GOOGLE_GEMINI_BASE_URL` en mode clé d'API (non vérifié).
- **Hermes** ne lit son adresse de base que dans `~/.hermes/config.yaml` : il n'est donc
  redirigé que si vous l'enveloppez avec `--mcp` (voir
  [Intégrations MCP](#un-seul-serveur-mcp-pour-lagent-enveloppé)).

> [!TIP]
> Pour un agent de code, ajoutez à `--keep` les noms de marques que cite son prompt système.

## Intégrations MCP

Avec `--mcp`, le proxy sert aussi un serveur MCP sur `http://127.0.0.1:8787/mcp`. Pointez-y
le client MCP de votre agent plutôt que Gmail, Notion ou votre CRM. Le proxy détient les
connexions et les identifiants, et l'agent reçoit les mêmes outils, valeurs masquées.

```bash
openmasq-proxy --mcp --level renforce          # serveurs lus dans ~/.openmasq/mcp.json
```

```jsonc
// ~/.openmasq/mcp.json, chmod 600. Le format de Claude Desktop : un fichier existant convient tel quel.
{ "mcpServers": {
  "crm":    { "command": "npx", "args": ["-y", "crm-mcp"], "env": { "CRM_TOKEN": "sk-…" } },
  "notion": { "url": "https://mcp.notion.com/mcp", "headers": { "Authorization": "Bearer …" } }
} }
```

- **Aucun identifiant n'atteint l'agent**, aucune vraie valeur non plus. Le résultat d'un
  outil est masqué au retour, et le substitut que l'agent renvoie ensuite est restauré à
  l'aller : une recherche porte donc sur le vrai nom.
- **Un seul coffre pour les deux canaux.** Les résultats d'outils et les messages du chat
  partagent le coffre de la session : une valeur garde un seul substitut sur les deux.
- **Le point d'accès a une clé.** Il exécute des outils avec vos identifiants, il exige donc
  le jeton de `~/.openmasq/mcp.token` (0600, stable d'une session à l'autre), en `?t=<jeton>`
  ou dans l'en-tête `x-openmasq-mcp-token`. Sans lui, la route répond `404`. Un client
  enveloppé reçoit l'adresse avec le jeton déjà dedans.
- **Transport standard.** Le point d'accès parle le streamable HTTP : n'importe quel client
  MCP peut s'en servir.

### Les écritures demandent votre accord

Cacher un identifiant ne retire pas l'autorité qu'il donne : une instruction injectée dans
le résultat d'un outil peut toujours demander un `send_message`. Un outil qui écrit
s'arrête donc sur une touche de votre terminal (`y` l'exécute, toute autre touche refuse).
Sans terminal pour demander, l'écriture est refusée.

| `--mcp-writes` | Effet |
|---|---|
| `confirm` (par défaut) | Demande dans le terminal. |
| `deny` | Refuse toute écriture et garde les lectures. |
| `allow` | Laisse passer les écritures. La carte de démarrage le signale en ambre. |

### Un seul serveur MCP pour l'agent enveloppé

```bash
openmasq-proxy --mcp -- claude
```

Quand vous enveloppez un client connu avec `--mcp`, le proxy le lance avec son propre point
d'accès comme **unique** serveur MCP du client, et reprend les serveurs que le client
déclarait pour que la session n'y perde rien. Vos fichiers ne sont pas modifiés : quitter
rend le client tel qu'il était. `--mcp-no-adopt` laisse de côté les serveurs du client.

| Client | Comment l'exclusivité est demandée | Mise en place |
|---|---|---|
| **Claude Code** | `--mcp-config <temp> --strict-mcp-config` | Aucune |
| **Codex** | Un `-c mcp_servers.<id>.enabled=false` par serveur qu'il liste, le nôtre, et `features.apps=false` pour son serveur d'applications intégré | Aucune. `codex exec` a besoin de `-c 'mcp_servers.openmasq.default_tools_approval_mode="approve"'` pour appeler un outil sans interaction. |
| **Gemini CLI** | `--allowed-mcp-server-names <le nôtre>` | Une fois : `gemini mcp add -s user -t http openmasq "http://127.0.0.1:8787/mcp?t=$(cat ~/.openmasq/mcp.token)"`. Enveloppez une session, pas une sous-commande (`gemini mcp list` refuse l'option). |
| **opencode** | Un fichier de configuration dans `OPENCODE_CONFIG` : le nôtre ajouté, chacun des siens désactivé | Aucune. Un `opencode.json` de projet peut primer sur ce fichier : le proxy revérifie donc sous sa configuration et refuse l'exclusivité si un serveur a survécu. Refusé si `OPENCODE_CONFIG` est déjà défini. |
| **Copilot CLI** | Un `--disable-mcp-server <id>` par serveur, `--disable-builtin-mcps`, et le nôtre via `--additional-mcp-config` | Aucune |
| **Hermes** | Un `HERMES_HOME` temporaire : votre `config.yaml` avec `model.base_url` pointé sur le proxy et notre point d'accès comme seul serveur MCP ; tout le reste est relié par lien symbolique à `~/.hermes` | Lancez `hermes setup` une fois |

> [!WARNING]
> Tout autre client garde ses propres serveurs MCP, et **ces appels d'outils ne passent pas
> par le masquage**. Le proxy le signale au démarrage. Pointez vous-même ce client sur
> `/mcp` et désactivez ses autres serveurs. Le même avertissement s'affiche quand
> l'exclusivité ne peut pas s'appliquer (par exemple, un identifiant de serveur que Codex
> ne peut pas désigner en ligne de commande).

Un serveur distant que le client a autorisé lui-même ne peut pas être repris, car son jeton
OAuth vit dans le magasin du client. Déclarez-le dans `~/.openmasq/mcp.json` et
connectez-vous ici à la place.

> [!NOTE]
> La commande `mcp list` d'un client affiche tous les serveurs configurés : elle lit la
> configuration, pas la session.

### Connecter un service

```bash
openmasq-proxy mcp add             # un formulaire : déclarer un serveur distant ou local
openmasq-proxy mcp status          # ce qui est déclaré, et ce qui est connecté
openmasq-proxy mcp login notion    # ouvre la page de consentement dans votre navigateur
openmasq-proxy mcp logout notion   # oublie ses jetons sur cette machine
openmasq-proxy mcp remove notion   # le retire du fichier des serveurs, jetons compris
```

- **`add`** demande au serveur ce dont il a besoin. La plupart des serveurs distants
  enregistrent un client d'eux-mêmes (RFC 7591) : déclarer Notion ou Sentry tient en une
  réponse, l'URL. Un fournisseur sans point d'enregistrement (Google) demande un identifiant
  client créé dans sa console, et le formulaire propose les portées qu'annonce le point
  d'accès. Un serveur local, c'est une commande, ses arguments et la clé d'API dont il a
  besoin, saisie sans écho. Le fichier est écrit en 0600.
- **`login`** déroule l'enregistrement dynamique du client et PKCE : vous ne créez aucune
  application OAuth. Il capte la redirection sur un écouteur 127.0.0.1 lié à cette seule
  tentative. Les démarrages suivants se reconnectent en silence et n'ouvrent jamais d'eux-mêmes
  une page de consentement.
- **`status`** liste aussi les serveurs déclarés par Claude Code : vous pouvez en connecter
  un ici en une commande.

**Les changements s'appliquent au proxy en cours.** Il surveille `~/.openmasq` : `mcp login`,
`mcp add`, `mcp remove` ou une modification du fichier des serveurs lui fait résoudre la
liste à nouveau et ne reconnecter que ce qui a changé. L'agent en est averti par
`notifications/tools/list_changed`. Un serveur **local** nouveau ou modifié fait exception :
le lancement d'un processus attend le prochain démarrage.

### Où sont stockés les identifiants

Uniquement dans `~/.openmasq`. La clé d'API d'un serveur local reste dans le fichier des
serveurs que vous avez écrit. Les jetons OAuth d'un serveur distant vont dans
`mcp-auth.enc`, chiffrés en AES-256-GCM sous un fichier `key` que vous seul pouvez lire.

| Plateforme | Protection |
|---|---|
| macOS, Linux | Clé et magasin écrits en 0600 dans un dossier 0700. Une clé, un magasin ou un fichier des serveurs lisible par d'autres utilisateurs est refusé. |
| Windows | Node ne sait ni lire ni régler les ACL NTFS : le contrôle des droits est donc écarté, et c'est l'ACL de votre dossier de profil qui protège le magasin. Définissez `OPENMASQ_PROXY_KEY` (32 octets, en hexadécimal ou base64, issus de votre propre gestionnaire de secrets) et aucun fichier de clé n'est écrit. |

> [!NOTE]
> L'application de bureau range ces secrets dans le trousseau du système. Le proxy, en Node
> pur, n'y a pas accès.

## Fichier de configuration

Chaque option peut s'écrire une fois dans `~/.openmasq/proxy.json` au lieu d'être tapée à
chaque session. Le fichier ne contient aucun secret (le fichier des serveurs les garde) :
vous pouvez le partager ou le versionner.

```json
{
  "run":     { "level": "renforce", "console": true, "disable": ["username"] },
  "clients": { "hermes": { "open": true } },
  "mcp": {
    "notion":     { "source": "openmasq", "level": "strict", "writes": "deny" },
    "github":     { "source": "client",   "level": "standard" },
    "filesystem": { "source": "off" }
  }
}
```

- **`run`** s'applique à chaque session. Les clés sont les noms d'option du tableau de
  [référence](#référence) (`level`, `mcpWrites`, `rulesOnly`…). Une option `--no-…`
  correspond à la même clé à `false` (`"splash": false`).
- **`clients.<outil>`** remplace `run` pour un outil enveloppé.
- **Priorité** : option > variable d'environnement > `clients.<outil>` > `run` > défaut.
- `reveal` et `json` ne sont que des options de session et ne peuvent pas aller dans le
  fichier.
- `--config <fichier>` ou `OPENMASQ_PROXY_CONFIG` désigne un autre fichier.

> [!IMPORTANT]
> Un fichier mal formé empêche le démarrage : une section inconnue, une clé inconnue ou mal
> orthographiée (l'erreur nomme la plus proche), ou une valeur hors des choix possibles. Une
> variable d'environnement fautive aussi. Un `"level": "strcit"` qui tournerait en
> `standard` sans rien dire serait une fuite.

**La section `mcp`** fixe une politique par serveur :

| Clé | Valeurs | Effet |
|---|---|---|
| `source` | `openmasq` | Votre serveur, pris dans le fichier des serveurs. Le serveur du client portant le même nom est écarté. Si votre fichier ne le déclare pas, la session s'en passe (signalé en ambre), sans jamais se rabattre sur celui du client. |
| | `client` | Le serveur du client, repris à travers le proxy. Cela ne veut jamais dire que le client lui parle en direct. |
| | `off` | Ni l'un ni l'autre : l'outil est absent de la session. |
| | (absent) | Le vôtre s'il est déclaré, celui du client sinon. |
| `level`, `disable`, `keep` | comme les options | Le masquage des résultats de ce serveur. Un serveur dont le niveau exige le modèle le charge au démarrage. |
| `writes` | `confirm`, `deny`, `allow` | Le contrôle des écritures pour ce seul serveur. |

La carte de démarrage et `mcp status` montrent la politique de chaque serveur. Ce qu'un
serveur plus strict masque reste masqué : tous les serveurs écrivent dans le même coffre de
session, et le coffre est appliqué avant toute détection. Un nom qu'un Notion en `strict` a
masqué reste masqué dans un chat en `standard`, ses fragments aussi (`Jean` ou `DUPONT`
seuls), en mode `fake` comme en mode `token`.

```bash
openmasq-proxy config init      # écrit un proxy.json vide et son JSON Schema à côté
openmasq-proxy config edit      # l'ouvre, puis le vérifie à la fermeture de l'éditeur
openmasq-proxy config show      # la session qui démarrerait, et d'où vient chaque valeur
openmasq-proxy config path      # le fichier lu
openmasq-proxy config schema    # affiche le JSON Schema
```

`config edit` utilise `$VISUAL` ou `$EDITOR`, sinon le premier installé parmi Cursor,
VS Code, Zed, Sublime Text, Windsurf (avec `--wait` ; sur macOS, leur CLI intégré est trouvé
même sans la commande shell), nano, vim, vi. `config show --json` produit une sortie lisible
par une machine.

## Console en direct

```bash
openmasq-proxy --console --mcp -- claude
openmasq-proxy --open --mcp -- hermes                    # ouvre l'onglet avant le démarrage de l'outil
openmasq-proxy --console --no-console-reveal -- claude   # substituts et compteurs seulement
#   console: http://127.0.0.1:8787/console?t=J4JYXzkIDj2v-p7mRF5p9g
```

`--console` sert une page sur la boucle locale : un tableau de tous les appels où chaque
valeur masquée est surlignée dans la couleur de sa catégorie, un récapitulatif par
catégorie, un histogramme par minute, et un volet avec le JSON, les valeurs détectées et
leur contexte. Deux vues : **Calls**, une ligne par appel, et **Data**, une ligne par valeur
avec son substitut, son type et son nombre d'occurrences. La page est en anglais. C'est
ainsi que vous suivez une session enveloppée, puisque l'outil occupe le terminal. `--open`
implique `--console` et ouvre l'onglet pour vous.

- **Les vraies valeurs sont affichées par défaut**, à côté de chaque substitut. Le bouton
  **Real values** de la page les masque. `--no-console-reveal` les garde entièrement hors
  de la page.
- **L'adresse porte un jeton créé pour la session.** La boucle locale n'est pas un contrôle
  d'accès : tout processus de la machine peut joindre 127.0.0.1. Sans le jeton, la route
  répond `404`.
- **Rien n'est conservé, rien n'est récupéré.** La page ne charge aucune police ni ressource
  distante. Le seul fichier écrit est l'adresse, dans `~/.openmasq/console.url` (0600,
  supprimé à l'arrêt du proxy).

**La rouvrir à tout moment.** Des outils enveloppés comme `claude` et `hermes` effacent
l'écran au démarrage, adresse comprise. Cette commande ouvre la vue en direct du proxy en
cours, depuis n'importe quel terminal :

```bash
openmasq-proxy console           # ouvre l'onglet ; --url affiche l'adresse à la place
!openmasq-proxy console          # tapé dans claude, opencode ou hermes (un ! en tête lance une commande shell)
```

Associez-la à une touche : tmux `bind-key o run-shell "openmasq-proxy console"`, kitty
`map f9 launch --type=background openmasq-proxy console`, ou une touche iTerm2 réglée sur
« Run coprocess ». Elle interroge d'abord le `/healthz` du proxy. Un lien auquel rien ne
répond est supprimé, pas ouvert.

## Terminal

Au démarrage, le proxy joue une courte séquence d'ouverture, puis affiche une carte : ce qui
part masqué et ce qui revient restauré, le niveau et ce qu'il laisse en clair, les serveurs
en amont, l'adresse de la console quand elle est active, et les trois lignes `export`.
Ensuite, chaque requête reçoit une ligne avec son issue, son statut, le temps de réponse de
l'amont, sa route et son hôte, et un compte par catégorie aux couleurs de masquage de
l'application (`NAME 2 · EMAIL 1`). Jamais une valeur, jamais la chaîne de requête. Un pied
de page montre les réglages et les compteurs en cours. Ctrl-C affiche les totaux de la
session.

**Touches**, dans un terminal interactif :

| Touche | Action |
|---|---|
| `l` | Change de niveau (refusé si le niveau exige un modèle absent et impossible à charger) |
| `m` | Bascule entre substituts et jetons |
| `f` | Montre ce qu'est devenue chaque valeur |
| `c` | Copie les trois lignes `export` |
| `s` | Affiche le résumé en cours |
| `x` | Efface |
| `?` | Liste les touches |
| `q` | Quitte |

Aucune touche n'ouvre une route en clair.

**Voir les vraies valeurs.** `--reveal` (ou `f`) affiche une ligne par valeur sous chaque
requête, par exemple `NAME  Camille Roussel → Armelle Aubertin`. C'est le seul endroit où le
proxy affiche une vraie valeur. Il est refusé avec `--json`, et avec `-- <outil>` sauf si
`--console` est actif (les valeurs vont alors sur la page de la console seulement, et le
journal garde les compteurs). Un historique de terminal se conserve et se copie, une page
non.

**Sortie et couleurs.** `--quiet` supprime les lignes de requête. `--json` écrit un objet
JSON par requête sur la sortie standard, pour un collecteur de journaux. Les couleurs sont en
24 bits quand le terminal l'annonce (`COLORTERM`), en 256 couleurs sinon, et absentes sous
`NO_COLOR`, `TERM=dumb` ou dans un tube. Le fond suit `COLORFGBG`. Forcez-le avec
`--theme auto|light|dark`. Un terminal qui n'indique rien est supposé sombre. La séquence
d'ouverture se désactive avec `--no-splash`, se passe avec n'importe quelle touche, et ne
joue jamais pour une machine (`--json`, `--quiet`, un tube, CI).

## Référence

```bash
openmasq-proxy [options] [-- <commande…>]
openmasq-proxy --help
```

<details>
<summary><b>Toutes les options</b> : option, variable d'environnement et clé de <code>proxy.json</code></summary>

| Option | Variable d'environnement | Clé du fichier | Défaut | Description |
|---|---|---|---|---|
| `--port <n>` | `OPENMASQ_PROXY_PORT` | `port` | `8787` | Port d'écoute sur la boucle locale |
| `--openai <origine>` | `OPENMASQ_UPSTREAM_OPENAI` | `openai` | `https://api.openai.com` | Amont au format OpenAI |
| `--anthropic <origine>` | `OPENMASQ_UPSTREAM_ANTHROPIC` | `anthropic` | `https://api.anthropic.com` | Amont au format Anthropic |
| `--gemini <origine>` | `OPENMASQ_UPSTREAM_GEMINI` | `gemini` | `https://generativelanguage.googleapis.com` | Amont au format Gemini |
| `--ner <dossier>` | `OPENMASQ_NER_DIR` | `ner` | paquet de dev s'il existe | Dossier du modèle local |
| `--rules-only` | | `rulesOnly` | désactivé | Règles déterministes seules, à tout niveau |
| `--mode fake\|token` | `OPENMASQ_PROXY_MODE` | `mode` | `fake` | Ce que voit le modèle à la place d'une valeur |
| `--level <niveau>` | `OPENMASQ_PROXY_LEVEL` | `level` | `standard` | `standard`, `renforce` ou `strict` |
| `--disable <types>` | `OPENMASQ_PROXY_DISABLED_KINDS` | `disable` | | Types laissés en clair, en plus du niveau |
| `--keep <valeurs>` | `OPENMASQ_PROXY_KEEP` | `keep` | | Valeurs exactes jamais masquées |
| `--always <termes>` | `OPENMASQ_PROXY_ALWAYS` | `always` | | Termes toujours masqués (`valeur:type`) |
| `--secrets-file <chemin>` | | `secretsFile` | | Chaînes exactes toujours effacées, une par ligne |
| `--quiet` | | `quiet` | désactivé | Aucune ligne par requête |
| `--json` | | (option seule) | désactivé | Un objet JSON par requête sur la sortie standard |
| `--reveal` | | (option seule) | désactivé | Vraies valeurs dans ce terminal |
| `--log <fichier>` | | `log` | `~/.openmasq/proxy.log` | Lignes de requête d'une session enveloppée |
| `--mcp` | | `mcp` | désactivé | Sert `/mcp` |
| `--mcp-config <fichier>` | `OPENMASQ_PROXY_MCP_CONFIG` | `mcpConfig` | `~/.openmasq/mcp.json` | Fichier des serveurs (implique `--mcp`) |
| `--mcp-writes <politique>` | `OPENMASQ_PROXY_MCP_WRITES` | `mcpWrites` | `confirm` | `confirm`, `deny` ou `allow` |
| `--mcp-no-adopt` | | `mcpAdopt` | reprise | Ne pas reprendre les serveurs du client enveloppé |
| `--console` | | `console` | désactivé | Sert la vue en direct sur `/console` |
| `--no-console-reveal` | `OPENMASQ_PROXY_CONSOLE_REVEAL` | `consoleReveal` | affichées | Substituts seulement sur la page de la console |
| `--open` | `OPENMASQ_PROXY_OPEN` | `open` | désactivé | Ouvre la vue en direct dans le navigateur (implique `--console`) |
| `--no-splash` | `OPENMASQ_PROXY_SPLASH` | `splash` | jouée | Saute la séquence d'ouverture |
| `--theme <thème>` | `OPENMASQ_PROXY_THEME` | `theme` | `auto` | `auto`, `light` ou `dark` |
| `--config <fichier>` | `OPENMASQ_PROXY_CONFIG` | | `~/.openmasq/proxy.json` | Le fichier de réglages |

Les variables d'environnement booléennes acceptent `1`/`0`, `true`/`false`, `yes`/`no` ou
`on`/`off`. `OPENMASQ_PROXY_KEY` fixe la clé de chiffrement du magasin d'identifiants (voir
[Où sont stockés les identifiants](#où-sont-stockés-les-identifiants)).

</details>

<details>
<summary><b>Sous-commandes</b></summary>

| Commande | Effet |
|---|---|
| `openmasq-proxy console [--url]` | Ouvre (ou affiche) la vue en direct du proxy en cours |
| `openmasq-proxy config show\|path\|init\|edit\|schema` | Consulte et modifie `proxy.json` |
| `openmasq-proxy mcp status\|add\|remove\|login\|logout` | Gère les serveurs MCP et leur connexion |

`mcp` accepte `--config <fichier>` pour un autre fichier des serveurs et `--no-adopt` pour
ignorer les serveurs que déclare Claude Code.

</details>

<details>
<summary><b>Fichiers de <code>~/.openmasq</code></b></summary>

| Fichier | Contenu |
|---|---|
| `proxy.json` | Réglages (aucun secret) |
| `mcp.json` | Serveurs MCP et leurs clés d'API (0600) |
| `mcp-auth.enc`, `key` | Jetons OAuth chiffrés et leur clé (0600) |
| `mcp.token` | La clé du point d'accès `/mcp` (0600) |
| `console.url` | L'adresse de la vue en direct pendant que le proxy tourne (0600) |
| `proxy.log` | Lignes de requête des sessions enveloppées : compteurs, catégories, routes et durées (0600) |

</details>

## Sécurité

- **Boucle locale uniquement, à dessein.** Le proxy écoute sur `127.0.0.1` et aucune option
  ne change cela : sur une interface réseau, il exposerait à la fois la clé de l'appelant et
  le coffre. Il refuse aussi (`403`) une requête dont le `Host` ou l'`Origin` n'est pas un
  nom de boucle locale.
- **Une clé par coffre.** Chaque coffre a sa propre clé de 256 bits et chaque substitut est
  un HMAC sous cette clé : connaître une valeur et son substitut ne dit rien d'une autre.
- **Rien de ce qu'un masquage a touché n'est écrit sur disque.** Les coffres vivent en
  mémoire. Le journal contient des compteurs, des catégories, des routes et des durées,
  jamais une valeur.
- **Échec fermé.** Un niveau qui exige le modèle ne démarre pas sans lui, une défaillance du
  modèle répond `502`, et un `POST` inconnu répond `501`. Rien n'est transmis en clair.

> [!NOTE]
> Le proxy ne masque que du texte. Une image, un PDF ou un fichier envoyé en octets
> (`inlineData`, `image_url`) passe tel quel. L'application de bureau fait l'OCR et le
> masquage des documents ; le proxy, non.

Le modèle de menace de l'ensemble du projet se trouve dans
[`SECURITY.md`](../../SECURITY.md).

## Développement

```bash
pnpm --filter @openmasq/proxy dev          # lance depuis les sources (tsx)
pnpm --filter @openmasq/proxy build        # dist/, ressources de la console comprises
pnpm --filter @openmasq/proxy preview:ui   # dessine l'écran du terminal avec des données inventées (ajoutez « light »)
pnpm bench:proxy                           # banc d'utilité : de vrais appels `claude -p` sur votre abonnement
```

Le `pnpm test` racine inclut `apps/proxy/src/**/*.test.ts`. Lisez [`CLAUDE.md`](CLAUDE.md)
avant une modification : il indique où vit chaque chose et les invariants que fixent les
tests. Le banc est décrit dans [`bench/README.md`](bench/README.md), et une ébauche de
conception pour LiteLLM dans [`examples/litellm/README.md`](examples/litellm/README.md).

## Licence

[Licence Apache 2.0](../../LICENSE).
