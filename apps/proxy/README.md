# @openmasq/proxy — the local redaction proxy

<sub>**English** · [Français](#openmasqproxy--le-proxy-local-de-masquage) · [openmasq.com](https://openmasq.com)</sub>

An OpenAI-, Anthropic- and Gemini-compatible endpoint on **127.0.0.1** that masks personal data
**before a request leaves the machine** and restores it in the reply — the desktop app's
engine, for every tool that speaks those two wires: an SDK, a coding agent, a notebook,
LangChain, the Vercel AI SDK, Cursor, Continue…

```bash
pnpm --filter @openmasq/proxy dev             # http://127.0.0.1:8787
export OPENAI_BASE_URL=http://127.0.0.1:8787/v1
export ANTHROPIC_BASE_URL=http://127.0.0.1:8787
```

Keep your own API key: the proxy forwards the request's headers untouched and never stores
a key. What it does hold is the **vault** — the fake → real map of one request — in memory,
on this machine, for the time of the request (or of a session, below).

**Routes** (an allow-list — a `POST` the proxy cannot mask is refused, never forwarded):
`/v1/chat/completions`, `/v1/responses`, `/v1/embeddings` → OpenAI; `/v1/messages`,
`/v1/messages/count_tokens` → Anthropic; `/v1beta/models/<model>:generateContent` and
`:streamGenerateContent?alt=sse` → Gemini. Prefix with `/openai`, `/anthropic` or `/gemini`
to force a family; `GET /v1/models` passes through. Streaming replies are restored **frame by frame**:
a fake that arrives split across two chunks is held back until it can be restored whole.

**What is masked**: system and user text, the assistant history, tool results, the arguments
of the tool calls already in the history. **What is restored**: the reply's text for the
reader (`unredactReply`); the tool-call arguments for the executor (`unredactArgs` — the
outside always gets the real value, URL-encoded forms included).

**Headers**: `x-openmasq-session: <id>` reuses one vault across turns (same fake for the
same value; evicted after an hour of silence); `x-openmasq-mode: fake|token` picks what the
model sees. The reply carries `x-openmasq-masked: <count>`.

**Flags / env**: `--port` (`OPENMASQ_PROXY_PORT`), `--openai`/`--anthropic`
(`OPENMASQ_UPSTREAM_*`), `--ner <dir>` (`OPENMASQ_NER_DIR`), `--mode`, `--quiet`, `--json`, `--log <file>`,
`--rules-only`; `-- <command…>` runs a tool through the proxy (below).

**What is masked — the app's own dials**: `--level standard|renforce|strict` (the app's
three levels, same category sets). **`standard` is the default here**: deterministic pattern
rules (email, phone, card, IBAN, national id, IP, path, secrets), no model to load, ready in a
fraction of a second. Names, companies, addresses and places come from the on-device model, so
they are only masked at `renforce` and `strict` — which load it, and refuse to start without it, `--disable email,phone` (kinds
left in clear on top of the level), `--keep Stripe,Canva` (never masked), `--always
"Groupe Delorme:company,FR76 3000…:iban"` (always masked whatever the detectors find — the
app's Vault; types: name, username, email, phone, company, address, city, id, card, iban, ip,
path, dob, secret), `--secrets-file <path>` (exact strings always erased, one per line).

**Coding agents** (setup per tool in `examples/`, with which rows are actually tested):
Claude Code honours `ANTHROPIC_BASE_URL=http://127.0.0.1:8787` (verified live on a
subscription). Codex needs a `model_providers` block with `wire_api = "responses"` — a bare
`OPENAI_BASE_URL` leaves it on its stored ChatGPT auth (verified against a fake upstream:
the request arrives and is masked). Gemini CLI reads `GOOGLE_GEMINI_BASE_URL` in API-key mode
but was not verifiable here (a personal account is refused before the base URL is read). For a
coding agent, `--disable path` keeps file paths readable by the model (they are restored in its
tool calls either way) and `--keep` the brand names its system prompt cites.

**Limits**: text only — an image, a PDF or a file sent as bytes (`inlineData`, `image_url`)
passes as is; the desktop app does the document OCR and masking, not the proxy.

**The NER is mandatory, and never downloaded.** Names, organisations and places in free text
need the on-device model; the proxy loads the desktop's bundle (`apps/desktop/build/ner-models`,
made by `pnpm bake:ner`), sha256-verified before onnxruntime reads a byte. No bundle ⇒ it
refuses to start. `--rules-only` is an explicit opt-out that says so on every start.

**Boundary.** Loopback only, by design: exposing it on a network interface would hand both
the caller's key and the vault to the network. Every vault has its own 256-bit key and every
fake is an HMAC under it: holding one (value, fake) pair says nothing about another value.
Pure Node, no Electron.

**What a fake keeps.** An IP keeps its class and its neighbourhood — a LAN address stays a
LAN address, two hosts of one /24 stay on one fake /24, and a subnet or CIDR the model writes
back reverses to the real network. A fake email keeps its extension, and colleagues share one
fake domain. A phone keeps its country code and mobile/landline class; a card its network; an
IBAN its country. What the model derives from a value is therefore still true of the real one.

**What you see.** A banner (endpoint, upstreams, level, NER status), then one line per
request: status, time to the upstream's answer, route, and a pill per category in the app's
own redaction hues — `NAME 2 · EMAIL 1 · COMPANY 1` — counts only, never a value, never the
query string. Ctrl-C prints the session's totals. Colours follow the terminal (`NO_COLOR`,
`FORCE_COLOR`, a pipe); `--quiet` keeps errors only; `--json` writes one JSON object per
request for a log collector.

**What you see**: a framed card at start (endpoint, upstreams, level, NER state, the three
`export` lines), then one line per request — status, time to the upstream's answer, route, and
a pill per category in the app's own redaction hues. A footer stays pinned at the bottom with
the live dials, the running counts and the keys.

**Seeing what was substituted**: `--reveal` (or the `f` key) prints, under each request, one
line per value — `NAME  Camille Roussel → Armelle Aubertin` — coloured by category. It is the
only place the proxy prints a real value, so it is allowed on your own terminal and refused
with `--json` and with `-- <tool>`: run the proxy in its own window and start the tool in
another one.

**Keys, on a terminal**: `l` cycles the level, `m` flips fakes/tokens, `f` shows what each
value became, `c` copies the three `export` lines to the clipboard, `s`
prints the summary so far, `x` clears, `?` lists the keys, `q` quits. Every key keeps the
proxy masking: none of them opens a route in clear.

**Run a tool through it**: `openmasq-proxy -- claude` (or `-- codex`, `-- gemini`) starts the
tool with its base URLs already pointed at the proxy, lets it own the terminal, and stops
when it exits — the request lines go to `~/.openmasq/proxy.log` (`--log <file>`) meanwhile,
and the summary prints after the tool closes.

---

# @openmasq/proxy — le proxy local de masquage

Un point d'accès compatible OpenAI, Anthropic et Gemini sur **127.0.0.1** qui masque les données
personnelles **avant qu'une requête quitte la machine** et les rétablit dans la réponse —
le moteur de l'app de bureau, pour tout outil qui parle ces deux protocoles : un SDK, un
agent de code, un notebook, LangChain, le SDK Vercel AI, Cursor, Continue…

```bash
pnpm --filter @openmasq/proxy dev             # http://127.0.0.1:8787
export OPENAI_BASE_URL=http://127.0.0.1:8787/v1
export ANTHROPIC_BASE_URL=http://127.0.0.1:8787
```

Gardez votre clé : le proxy transmet les en-têtes de la requête tels quels et ne stocke
aucune clé. Ce qu'il tient, c'est le **coffre** — la table faux → réel d'une requête — en
mémoire, sur cette machine, le temps de la requête (ou d'une session, ci-dessous).

**Routes** (une liste d'autorisation — un `POST` que le proxy ne sait pas masquer est refusé,
jamais transmis) : `/v1/chat/completions`, `/v1/responses`, `/v1/embeddings` → OpenAI ;
`/v1/messages`, `/v1/messages/count_tokens` → Anthropic ; `/v1beta/models/<modèle>:generateContent`
et `:streamGenerateContent?alt=sse` → Gemini. Préfixez par `/openai`, `/anthropic` ou `/gemini`
pour forcer la famille ; `GET /v1/models` passe tel quel. Les réponses en flux
sont rétablies **trame par trame** : un faux coupé entre deux morceaux est retenu jusqu'à
pouvoir être rétabli entier.

**Ce qui est masqué** : le texte système et utilisateur, l'historique de l'assistant, les
résultats d'outils, les arguments des appels d'outils déjà dans l'historique. **Ce qui est
rétabli** : le texte de la réponse pour le lecteur (`unredactReply`) ; les arguments des
appels d'outils pour l'exécutant (`unredactArgs` — l'extérieur reçoit toujours la vraie
valeur, formes encodées dans une URL comprises).

**En-têtes** : `x-openmasq-session: <id>` réutilise un coffre d'un tour à l'autre (même faux
pour la même valeur ; oublié après une heure de silence) ; `x-openmasq-mode: fake|token`
choisit ce que voit le modèle. La réponse porte `x-openmasq-masked: <nombre>`.

**Options / env** : `--port` (`OPENMASQ_PROXY_PORT`), `--openai`/`--anthropic`
(`OPENMASQ_UPSTREAM_*`), `--ner <dossier>` (`OPENMASQ_NER_DIR`), `--mode`, `--quiet`, `--json`, `--log <fichier>`,
`--rules-only` ; `-- <commande…>` lance un outil à travers le proxy (ci-dessous).

**Ce qui est masqué — les réglages de l'app** : `--level standard|renforce|strict` (les
trois niveaux de l'app, mêmes catégories). **`standard` est le défaut ici** : des règles
déterministes (e-mail, téléphone, carte, IBAN, identifiant national, IP, chemin, secrets),
aucun modèle à charger, prêt en une fraction de seconde. Les noms, entreprises, adresses et
lieux viennent du modèle local : ils ne sont masqués qu'en `renforce` et `strict`, qui le
chargent et refusent de démarrer sans lui, `--disable email,phone`
(catégories laissées en clair en plus du niveau), `--keep Stripe,Canva` (jamais masqués),
`--always "Groupe Delorme:company,FR76 3000…:iban"` (toujours masqués quoi que trouvent les
détecteurs — le Coffre de l'app ; types : name, username, email, phone, company, address,
city, id, card, iban, ip, path, dob, secret), `--secrets-file <chemin>` (chaînes exactes
toujours effacées, une par ligne).

**Agents de code** (configuration par outil dans `examples/`, avec l'état de test de chaque
ligne) : Claude Code respecte `ANTHROPIC_BASE_URL=http://127.0.0.1:8787` (vérifié en direct sur
abonnement). Codex exige un bloc `model_providers` avec `wire_api = "responses"` — la variable
`OPENAI_BASE_URL` seule le laisse sur son authentification ChatGPT (vérifié contre un faux
amont : la requête arrive et est masquée). Gemini CLI lit `GOOGLE_GEMINI_BASE_URL` en mode clé
API mais n'a pas pu être vérifié ici (un compte personnel est refusé avant la lecture de
l'adresse). Pour un agent de code, `--disable path` laisse les chemins lisibles par le modèle
(rétablis de toute façon dans ses appels d'outils) et `--keep` les marques que son prompt cite.

**Limites** : du texte seulement — une image, un PDF ou un fichier envoyé en octets
(`inlineData`, `image_url`) passe tel quel ; l'app de bureau fait l'OCR et le masquage des
documents, pas le proxy.

**La NER est obligatoire, et jamais téléchargée.** Les noms, organisations et lieux en texte
libre demandent le modèle embarqué ; le proxy charge le paquet de l'app de bureau
(`apps/desktop/build/ner-models`, produit par `pnpm bake:ner`), vérifié par sha256 avant
qu'onnxruntime en lise un octet. Sans paquet, il refuse de démarrer. `--rules-only` est un
renoncement explicite, rappelé à chaque démarrage.

**Frontière.** Boucle locale seulement, à dessein : l'exposer sur une interface réseau
livrerait la clé de l'appelant et le coffre au réseau. Chaque coffre a sa propre clé de 256
bits et chaque faux est un HMAC sous elle : détenir un couple (valeur, faux) ne dit rien d'une
autre valeur. Node pur, pas d'Electron.

**Ce qu'un faux conserve.** Une IP garde sa classe et son voisinage : une adresse de réseau
local reste une adresse de réseau local, deux hôtes d'un même /24 restent sur un même /24
factice, et un sous-réseau ou un CIDR que le modèle écrit en retour est restauré vers le vrai
réseau. Un faux e-mail garde son extension, et des collègues partagent un même domaine
factice. Un téléphone garde son indicatif et sa classe mobile/fixe, une carte son réseau, un
IBAN son pays. Ce que le modèle déduit d'une valeur reste donc vrai de la vraie.

**Ce que l'on voit.** Une bannière (adresse, amonts, niveau, état du NER), puis une ligne
par requête : statut, délai de réponse de l'amont, route, et une pastille par catégorie aux
couleurs de masquage de l'app — `NAME 2 · EMAIL 1 · COMPANY 1` — des comptes, jamais une
valeur, jamais la query string. Ctrl-C imprime les totaux de la session. Les couleurs suivent
le terminal (`NO_COLOR`, `FORCE_COLOR`, un tube) ; `--quiet` ne garde que les erreurs ;
`--json` écrit un objet JSON par requête pour un collecteur de logs.

**Ce que l'on voit** : une carte encadrée au démarrage (adresse, amonts, niveau, état du NER,
les trois lignes `export`), puis une ligne par requête — statut, délai de réponse de l'amont,
route, et une pastille par catégorie aux couleurs de masquage de l'app. Un pied de page reste
fixé en bas avec les réglages en cours, les compteurs et les touches.

**Voir ce qui a été substitué** : `--reveal` (ou la touche `f`) imprime, sous chaque requête,
une ligne par valeur — `NAME  Camille Roussel → Armelle Aubertin` — colorée par catégorie.
C'est le seul endroit où le proxy imprime une vraie valeur : autorisé sur votre terminal,
refusé avec `--json` et avec `-- <outil>`, où il faut lancer le proxy dans sa propre fenêtre
et l'outil dans une autre.

**Touches, dans un terminal** : `l` change de niveau, `m` bascule faux/jetons, `f` montre ce
qu'est devenue chaque valeur, `c` copie les trois lignes `export` dans le
presse-papiers, `s` imprime le résumé en cours, `x` efface, `?` liste les touches, `q` quitte.
Chaque touche laisse le proxy masquer : aucune n'ouvre une route en clair.

**Lancer un outil à travers** : `openmasq-proxy -- claude` (ou `-- codex`, `-- gemini`) démarre
l'outil avec ses adresses de base déjà pointées sur le proxy, lui laisse le terminal, et s'arrête
avec lui — les lignes de requête vont dans `~/.openmasq/proxy.log` (`--log <fichier>`) pendant ce
temps, et le résumé s'imprime à la fermeture de l'outil.
