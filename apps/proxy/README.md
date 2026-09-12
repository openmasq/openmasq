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
(`OPENMASQ_UPSTREAM_*`), `--ner <dir>` (`OPENMASQ_NER_DIR`), `--mode`, `--quiet`, `--json`, `--log <file>`, `--theme`, `--no-splash`,
`--rules-only`; `-- <command…>` runs a tool through the proxy (below).

**What is masked — the app's own dials**: `--level standard|renforce|strict` (the app's
three levels, same category sets). **`standard` is the default here**: deterministic pattern
rules (email, phone, card, IBAN, national id, IP, path, secrets), no model to load, ready in a
fraction of a second — **a name, a company or a handle is never masked at `standard`**. Names,
companies, addresses and places come from the on-device model, and a handle from a rule whose
only signal is a leading `@` (a scope, a flag or a bot mention on code), so they are only masked at `renforce` and
`strict` — which load it, and refuse to start without it. ⚠️ Above `standard` the model reasons
on substitutes, so **an answer about a person or an organisation can come out different**;
the card and the console both say so. `renforce` still spares famous brands and public figures
(world knowledge, never your data), and the vendors' own names (Anthropic, Claude, OpenAI,
Gemini, Copilot…) stay in clear at every level — a coding agent's system prompt names them on
every call, and a model told it is « Célestin » from « Corvanics » answers differently, `--disable email,phone` (kinds
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
coding agent, file paths are already readable (`path` is off by default — a path is faked
segment by segment, which handed agents commands they could not run; Strict still hides them),
and `--keep` takes the brand names its system prompt cites.

**Integrations, without handing the agent your credentials** (`--mcp`). The proxy also
serves an **MCP server** at `http://127.0.0.1:8787/mcp`. Point your agent's MCP client there
instead of at Gmail, Notion or your CRM: the proxy holds the connections, and the agent gets
the same tools with the values replaced.

```bash
openmasq-proxy --mcp --level renforce           # servers from ~/.openmasq/mcp.json
```

```jsonc
// ~/.openmasq/mcp.json — chmod 600; Claude Desktop's shape, so an existing file works as is
{ "mcpServers": {
  "crm":    { "command": "npx", "args": ["-y", "crm-mcp"], "env": { "CRM_TOKEN": "sk-…" } },
  "notion": { "url": "https://mcp.notion.com/mcp", "headers": { "Authorization": "Bearer …" } }
} }
```

The API key in that file never reaches the agent, and neither does a real value: a tool
result is masked on the way back, and the fake the agent then sends is restored on the way
out — so a search queries the real name, not a substitute. **The vault is the same one the
chat messages use**, so a value keeps one substitute across both channels.

A tool that **writes** stops for a keystroke on your terminal (`y` runs it, anything else
refuses), because hiding the credential removes the leak of the secret, not the authority it
grants — an injected instruction in a tool result can still ask for `send_message`. With no
terminal to ask, a write is refused. `--mcp-writes deny` refuses them outright and keeps the
reads; `--mcp-writes allow` passes them, and the card says so in amber.

**One MCP, and it is ours** — `openmasq-proxy --mcp -- claude`. Wrapping the client does not
just point its base URL here: it starts the agent with our endpoint as its **only** MCP
server, and takes over the servers it declared so the session loses nothing. One MCP exposing
every service, all of it masked. Nothing of yours is edited; quitting restores the client
exactly. `--mcp-no-adopt` leaves its servers behind.

Three clients can be asked for that, each in its own words — and the proxy asks, rather than
rewriting anyone's configuration:

| Client | How exclusivity is asked for | Setup |
|---|---|---|
| **Claude Code** | `--mcp-config <temp> --strict-mcp-config` | none — verified in a real session, the model's tool list came back as `mcp__openmasq__crm__*` and nothing else |
| **Codex** | one `-c mcp_servers.<id>.enabled=false` per server it has, ours, and `features.apps=false` for the built-in apps server no listing reports | none — verified in a real session: the model's tool list was ours alone and the contact it printed was the vault's fake. `codex exec` needs `-c 'mcp_servers.openmasq.default_tools_approval_mode="approve"'` to call a tool non-interactively |
| **Gemini CLI** | `--allowed-mcp-server-names <ours>` | once: `gemini mcp add -s user -t http openmasq http://127.0.0.1:8787/mcp`. Wrap a session (`-- gemini`), not a subcommand — `gemini mcp list` refuses the flag |
| **opencode** | a config file of ours in `OPENCODE_CONFIG`: our server added, each of its own disabled | none — but a project `opencode.json` outranks that file, so the proxy re-asks under its own configuration and refuses exclusivity if anything survived |
| **Copilot CLI** | one `--disable-mcp-server <id>` per server, `--disable-builtin-mcps`, and ours through `--additional-mcp-config` | none — the list comes from `copilot mcp list --json`. Its own flags, read in the binary; a live run needs a GitHub login, so that half is not claimed here |

A client's own `mcp list` prints every CONFIGURED server: it inspects the config, not the
session. **Any other client** — Cursor CLI, goose (`--with-extension` only adds), Antigravity
(no MCP flag on its CLI, and its IDE has no bring-your-own-key hook either) — offers no way to
ask, so the proxy says so at startup rather than implying a mask it cannot apply: point it at
`/mcp` yourself and switch its others off. Its MCP endpoint is standard streamable HTTP, so
any MCP client can use it.

A remote the client authorised itself **cannot** be taken over — the OAuth token lives in its
store, not ours — so it is reported as needing its own login here, and stays reachable only by
declaring it in `~/.openmasq/mcp.json` with a credential of its own. And a client we do not
know how to switch off is said so on start: **its own MCP servers stay on, and those tool
calls do not pass through the mask.** Claude Code is the one we can do this for today.

**Configuring it once — `~/.openmasq/proxy.json`.** Every flag can be written in a file
instead of typed on every run, under the same name minus the dashes. No secret lives in it
(the servers file keeps those), so it can be shared or versioned in a team:

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

`run` is every run; `clients.<tool>` overrides it for one wrapped tool. Precedence: **flag >
env > `clients.<tool>` > `run` > default**. `--config <file>` or `OPENMASQ_PROXY_CONFIG` names
another file. **A malformed file refuses the start** — a bad section, an unknown or misspelt
key (named, with the nearest one), a value that is none of the choices — and so does a bad
environment variable: a `"level": "strcit"` that silently ran at standard would be a leak.
`reveal` and `json` stay per-run flags, on purpose. `openmasq-proxy config init` writes the
empty file with its JSON Schema beside it (the editor completes keys and values from it);
`config edit` opens it — `$VISUAL`/`$EDITOR`, or else the first editor installed: Cursor,
VS Code, Zed, Sublime, Windsurf (with `--wait`; on macOS their bundled CLI is found even without
the shell command installed), then nano, vim, vi — and **checks it when
the editor returns**, the way the run would; `config show` prints the run that would start and **where each value came
from**; `config path` the file it reads.

The `mcp` section names each server once. **`source`** says whose it is: `openmasq` — yours,
from the servers file, and the client's same-named one is set aside; `client` — theirs, taken
over *through the proxy* even when you declare one; `off` — neither, the tool is absent from
the run. Left out, the rule is the one adoption already had: yours when declared, theirs
otherwise. `source: "openmasq"` on a server your file does not declare leaves the run
**without** it, said in amber — never a fallback to the client's, which is exactly what the
line rules out. And `client` never means the client speaks to it directly: that path bypasses
the mask, and a file cannot reopen it. **`level`, `disable`, `keep`** give that server's
results a masking of their own (a server that asks for the on-device model asks for it at
startup, like the chat); **`writes`** gates its mutating tools by itself. The card's server
line and `mcp status` show the policy.

**A connection made through openmasq takes effect now, not at the next start.** The
running proxy watches `~/.openmasq`: `mcp login notion`, `mcp add`, `mcp remove` or an edit
of the servers file makes it resolve the list again — same precedence, same policy — and
reconnect **only what moved**; the other servers keep their connection and any call in
flight. The agent is told by `notifications/tools/list_changed` on the stream it holds open
(Claude Code re-lists on it), so a tool appears, changes credential or disappears
mid-session. The client's own servers stay switched off for the whole run — exclusivity is
decided once, at start — so signing in to Notion here replaces the adopted one in place: the
agent keeps the tool, and it now runs through openmasq's own credential. The CLI says so:
« the proxy running on … picks this up now — no restart needed ».

**What a stricter server masks stays masked.** Every masker writes the same session vault,
and the vault is replayed before anything is detected — so a name a `strict` Notion vaulted
stays masked in a `standard` chat that never looks for names, its parts included: `Jean
Dupont` from Notion means `Jean` and `DUPONT` alone are substituted in your next message, in
`fake` mode (per-word aliases) as in `token` mode (a forward-only replay of the fragments,
Title-case and CAPS). The vault outranks the level, in one direction only.

**Where the credentials live, and how to connect a service.** In `~/.openmasq`, and nowhere
else: a stdio server's API key stays in the servers file you wrote, and a remote server's
OAuth tokens are obtained by the CLI and written to `mcp-auth.enc` — AES-256-GCM, beside a
`key` file only you can read. The agent never receives either.

```bash
openmasq-proxy mcp add             # a form: declare a server, remote or local
openmasq-proxy mcp remove notion   # drop it, tokens included
```

`add` asks the server what it needs rather than asking you. Most remote servers register a
client on their own (RFC 7591), so declaring Notion or Sentry is one question — the URL.
A provider that issues clients by hand is the exception, and the form says so before asking:
Google's MCP endpoints point at `accounts.google.com`, which publishes no registration
endpoint, so they need a client id from its console — and the form offers the scopes the
endpoint itself advertises as the default. A local server is a command, its arguments, and
any API key it wants in its environment, typed without echo. The file is written 0600.

```bash
openmasq-proxy mcp status          # what is declared, and what is signed in
openmasq-proxy mcp login notion    # opens the consent page in your browser
openmasq-proxy mcp logout notion   # forget the tokens on this machine
```

`login` runs the connector handshake — dynamic client registration and PKCE, so there is no
OAuth app for you to create — catches the redirect on a 127.0.0.1 listener bound to that one
attempt, and stores what comes back. Afterwards the proxy reconnects on its own, silently: a
startup that opened a consent page nobody asked for would be worse than one that says `not
signed in — run: openmasq-proxy mcp login notion`. `mcp status` also lists the servers Claude
Code declares, so a service it already had can be signed in here in one command.

**Portability of that store.** The cipher is the same everywhere — `node:crypto`, AES-256-GCM
— but the file permissions are not. On **macOS and Linux** the key and the store are written
0600 in a 0700 directory, and a servers file others can read is refused outright. On
**Windows** those bits do not exist: Node maps `chmod` to the read-only attribute alone and
never touches an NTFS ACL, so the mode check is skipped (it would refuse every file) and what
protects the store is the ACL your profile directory already carries. That is a weaker
guarantee, and the way to close it is `OPENMASQ_PROXY_KEY` — a 32-byte key from your own
secret manager, after which no key file is written at all. The desktop app has a stronger
answer on every platform (the OS keychain, via Electron); a pure-Node CLI cannot reach it.

**Watching it live, in a browser** — `--console`. The proxy serves a page of its own (in
English, like the CLI — its labels are the product's English catalogue) on
loopback: a log table of every call, each masked value swiped in its category's colour, a
recap by category, a per-minute histogram, and a drawer with the JSON, the detected data and
the context. It is how you watch a WRAPPED run, since the tool owns the terminal.

```bash
openmasq-proxy --console --mcp -- claude
openmasq-proxy --open --mcp -- hermes      # opens the tab for you: hermes clears the screen as it starts
openmasq-proxy --console --no-console-reveal -- claude   # substitutes and counts only on the page
#   console: http://127.0.0.1:8787/console?t=J4JYXzkIDj2v-p7mRF5p9g
```

**The real values are on the page by default**, beside each substitute — the page is the
operator's own screen, on loopback, behind a token minted for the run, and it is how a
wrapped run is watched. Its « Real values » toggle hides them; `--no-console-reveal` keeps
them off the page entirely (the button then says so, rather than flipping to a row of dots).
`--reveal` is the **terminal's** own opt-in and never a default: a scrollback is kept, copied
and logged, a page is not. **The URL carries a token minted for the run**: loopback is not an access control, every process on the machine
can reach 127.0.0.1, and without the token the route answers 404. Nothing a redaction touched
is stored — no disk, no cache — and the page fetches nothing from anywhere: no CDN font, no
remote asset. The one thing written is the address itself, to `~/.openmasq/console.url`
(0600, beside the key file, removed when the proxy exits), so that the shortcut below finds it.

A second `-- <tool>` joins the proxy already running and opens *its* live view. If that proxy
has none — started without `--console`, or an older build — and you asked for one (`--console`,
`--open`), the run does not join: it starts its own on the next free port, says so under the
card, and points the tool at that one.

**Opening it at any moment — the shortcut.** The tool owns the screen, and hermes and claude
both clear it as they start, card and URL included. `openmasq-proxy console` opens the live
view of the proxy that is running, from any terminal, whichever tool is wrapped:

```bash
openmasq-proxy console            # opens the tab; --url prints the address instead
!openmasq-proxy console           # typed in claude, opencode or hermes: a line that starts with ! runs as a shell command
```

Bind it to a key and it is one keystroke away for the whole run — tmux `bind-key o run-shell
"openmasq-proxy console"`, kitty `map f9 launch --type=background openmasq-proxy console`,
iTerm2 a key mapped to « Run coprocess ». It opens only what answers for itself: the origin
is asked `/healthz` first, and a link nothing answers for is forgotten, never opened.

**Watching a wrapped run.** The tool's own interface owns the terminal, so the request lines
go to a file instead: `~/.openmasq/proxy.log` by default, or `--log <file>`.

```bash
tail -f ~/.openmasq/proxy.log        # in a second window, while the tool runs
```

A live bar on the last lines of that same terminal was tried and removed. Reserving them
shrinks the terminal's scrolling region, which confines scrolling — but does **not** change
what the wrapped tool believes the screen is: measured, a child under a `1..34` region of 40
rows still reports `40 100`. A tool that repaints a full-screen interface therefore keeps
writing to the last row, and the two writers shred each other's lines. Reserving space a
full-screen child respects needs a pty the proxy owns, which it has not. To watch a wrapped
run with the values shown, `--console` is enough: the page carries them by default, and the
log file keeps counts. (`--reveal` beside `--` without `--console` is refused: the only screen
left would be the file.)

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

**What you see**: the brand mark and a framed card at start — the round trip first (what leaves
masked, what comes back restored), then the level and what it leaves in clear, the upstreams,
the live view's URL when `--console` is on, and the three `export` lines — then two lines per
request — a coloured gutter that says the
outcome before the line is read, the status, the time to the upstream's answer, the route and
the host it went to, then a bar per category and a pill per category in the app's own
redaction hues. A filled footer stays pinned at the bottom with the live dials, the running
counts, the last requests as a strip and the keys.

**At start-up**, a second and a half on the alternate screen: the loader the desktop chat runs
while it thinks — the redaction mark travelling in the palette's own hues — laid around the
name, which writes itself inside it letter by letter. The ring then closes, two lines say what
this run masks and what it leaves in clear, and the card below writes itself in line by line
rather than landing whole. Any key skips it,
`--no-splash` (or `OPENMASQ_PROXY_SPLASH=0`) turns it off, and it never plays for a machine
(`--json`, `--quiet`, a pipe, CI).

**Colours** follow the terminal: 24-bit when it announces truecolor (`COLORTERM`), the
256-colour cube otherwise, and none at all under `NO_COLOR`, `TERM=dumb` or through a pipe.
Two blocks carry a background of their own — the mark and the footer bar — so they follow the
terminal's ground: `COLORFGBG` decides, `--theme auto|light|dark` (or `OPENMASQ_PROXY_THEME`)
overrides it, and a terminal that publishes nothing is assumed dark.

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
(`OPENMASQ_UPSTREAM_*`), `--ner <dossier>` (`OPENMASQ_NER_DIR`), `--mode`, `--quiet`, `--json`, `--log <fichier>`, `--theme`, `--no-splash`,
`--rules-only` ; `-- <commande…>` lance un outil à travers le proxy (ci-dessous).

**Ce qui est masqué — les réglages de l'app** : `--level standard|renforce|strict` (les
trois niveaux de l'app, mêmes catégories). **`standard` est le défaut ici** : des règles
déterministes (e-mail, téléphone, carte, IBAN, identifiant national, IP, chemin, secrets),
aucun modèle à charger, prêt en une fraction de seconde — **ni nom, ni entreprise, ni pseudo
masqués en `standard`**. Les noms, entreprises, adresses et lieux viennent du modèle local, et
un pseudo d'une règle dont le seul signal est un `@` en tête (un scope, un drapeau, une mention
de bot dans du code) : ils ne sont masqués qu'en `renforce` et `strict`, qui le
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
l'adresse). Pour un agent de code, les chemins sont déjà lisibles (`path` est inactif par
défaut — un chemin est remplacé segment par segment, ce qui rendait aux agents des commandes
inexécutables ; Strict les masque toujours), et `--keep` prend les marques que son prompt cite.

**Des intégrations, sans confier vos identifiants à l'agent** (`--mcp`). Le proxy sert aussi
un **serveur MCP** sur `http://127.0.0.1:8787/mcp`. Pointez-y le client MCP de votre agent
plutôt que vers Gmail, Notion ou votre CRM : le proxy garde les connexions, et l'agent reçoit
les mêmes outils, valeurs remplacées.

```bash
openmasq-proxy --mcp --level renforce           # serveurs lus dans ~/.openmasq/mcp.json
```

```jsonc
// ~/.openmasq/mcp.json — chmod 600 ; forme de Claude Desktop, un fichier existant convient
{ "mcpServers": {
  "crm":    { "command": "npx", "args": ["-y", "crm-mcp"], "env": { "CRM_TOKEN": "sk-…" } },
  "notion": { "url": "https://mcp.notion.com/mcp", "headers": { "Authorization": "Bearer …" } }
} }
```

La clé d'API de ce fichier n'atteint jamais l'agent, ni aucune valeur réelle : le résultat
d'un outil est masqué au retour, et le substitut que l'agent renvoie ensuite est rétabli à
l'aller — une recherche interroge donc le vrai nom, pas un faux. **Le coffre est celui des
messages**, si bien qu'une valeur garde un seul substitut sur les deux canaux.

Un outil qui **écrit** s'arrête sur une touche de votre terminal (`y` l'exécute, toute autre
touche refuse) : cacher l'identifiant supprime la fuite du secret, pas l'autorité qu'il
donne — une instruction injectée dans un résultat d'outil peut toujours demander un
`send_message`. Sans terminal pour demander, une écriture est refusée. `--mcp-writes deny`
les refuse et laisse passer les lectures ; `--mcp-writes allow` les laisse passer, et la
carte le dit en ambre.

**Un seul MCP, et c'est le nôtre** — `openmasq-proxy --mcp -- claude`. Envelopper le client
ne se contente pas d'y pointer ses URL de base : l'agent démarre avec notre point d'accès
comme **unique** serveur MCP, et les serveurs qu'il déclarait sont repris pour que la session
n'y perde rien. Un seul MCP, exposant tous les services, le tout masqué. Aucun de vos fichiers
n'est modifié ; quitter restitue le client tel quel. `--mcp-no-adopt` laisse ses serveurs de
côté.

Trois clients savent l'exprimer, chacun à sa façon — et le proxy le leur DEMANDE, il ne
réécrit la configuration de personne :

| Client | Comment l'exclusivité est demandée | Mise en place |
|---|---|---|
| **Claude Code** | `--mcp-config <temp> --strict-mcp-config` | rien — vérifié en session réelle, la liste d'outils du modèle est revenue avec `mcp__openmasq__crm__*` et rien d'autre |
| **Codex** | un `-c mcp_servers.<id>.enabled=false` par serveur qu'il a, le nôtre, et `features.apps=false` pour le serveur builtin qu'aucune liste ne montre | rien — vérifié en session réelle : la liste d'outils du modèle était le nôtre seul, et le contact imprimé était le faux du coffre. `codex exec` a besoin de `-c 'mcp_servers.openmasq.default_tools_approval_mode="approve"'` pour appeler un outil sans interaction |
| **Gemini CLI** | `--allowed-mcp-server-names <le nôtre>` | une fois : `gemini mcp add -s user -t http openmasq http://127.0.0.1:8787/mcp`. Enveloppez une session (`-- gemini`), pas une sous-commande — `gemini mcp list` refuse le drapeau |
| **opencode** | un fichier de config à nous dans `OPENCODE_CONFIG` : notre serveur ajouté, chacun des siens désactivé | rien — mais un `opencode.json` de projet l'emporte sur ce fichier, alors le proxy repose la question sous sa propre configuration et refuse l'exclusivité si quelque chose a survécu |
| **Copilot CLI** | un `--disable-mcp-server <id>` par serveur, `--disable-builtin-mcps`, et le nôtre via `--additional-mcp-config` | rien — la liste vient de `copilot mcp list --json`. Ses propres drapeaux, lus dans le binaire ; un run réel demande une connexion GitHub, donc cette moitié n'est pas revendiquée ici |

Le `mcp list` d'un client affiche les serveurs CONFIGURÉS : il inspecte la configuration, pas
la session. **Tout autre client** — Cursor CLI, goose (`--with-extension` ne fait qu'ajouter),
Antigravity (aucun drapeau MCP sur sa CLI, et son IDE n'a pas de crochet BYOK non plus) —
n'offre aucun moyen de le demander : le proxy
le dit au démarrage plutôt que de laisser croire à un masquage qu'il ne peut pas appliquer —
pointez-le vous-même sur `/mcp` et désactivez ses autres serveurs. Son point d'accès MCP est
un streamable HTTP standard : n'importe quel client MCP sait s'y brancher.

Un service distant que le client a autorisé lui-même **ne peut pas** être repris — le jeton
OAuth vit dans son magasin, pas dans le nôtre : il est signalé comme demandant sa propre
connexion ici, et reste joignable en le déclarant dans `~/.openmasq/mcp.json` avec un
identifiant à lui. Et un client qu'on ne sait pas désactiver est annoncé au démarrage :
**ses propres serveurs MCP restent actifs, et ces appels d'outils ne passent pas par le
masque.** Claude Code est le seul pour lequel on sait le faire aujourd'hui.

**Le configurer une fois — `~/.openmasq/proxy.json`.** Chaque drapeau peut s'écrire dans un
fichier plutôt que se taper à chaque session, sous le même nom sans les tirets. Aucun secret
n'y vit (le fichier des serveurs les garde), donc il se partage ou se versionne en équipe :

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

`run` vaut pour chaque session ; `clients.<outil>` le surcharge pour un outil enveloppé.
Précédence : **drapeau > env > `clients.<outil>` > `run` > défaut**. `--config <fichier>` ou
`OPENMASQ_PROXY_CONFIG` désigne un autre fichier. **Un fichier malformé refuse le démarrage** —
une section inconnue, une clé inconnue ou mal orthographiée (nommée, avec la plus proche), une
valeur hors des choix — et une variable d'environnement fautive aussi : un `"level": "strcit"`
qui tournerait en standard sans rien dire serait une fuite. `reveal` et `json` restent des
drapeaux de session, exprès. `openmasq-proxy config init` écrit le fichier vide avec son JSON
Schema à côté (l'éditeur complète clés et valeurs grâce à lui) ; `config edit` l'ouvre —
`$VISUAL`/`$EDITOR`, sinon le premier éditeur installé : Cursor, VS Code, Zed, Sublime,
Windsurf (avec `--wait` ; sur macOS leur CLI embarqué est trouvé même sans la commande shell
installée), puis nano, vim, vi — et **le vérifie au retour de l'éditeur**, comme
le ferait la session ;
`config show` affiche la session qui démarrerait et **d'où vient chaque valeur** ;
`config path` le fichier lu.

La section `mcp` nomme chaque serveur une fois. **`source`** dit à qui il est : `openmasq` —
le vôtre, depuis le fichier des serveurs, et celui du client portant le même nom est écarté ;
`client` — le sien, repris *à travers le proxy* même si vous en déclarez un ; `off` — ni l'un
ni l'autre, l'outil est absent de la session. Omis, la règle est celle que la reprise avait
déjà : le vôtre s'il est déclaré, le sien sinon. `source: "openmasq"` sur un serveur que votre
fichier ne déclare pas laisse la session **sans** lui, dit en ambre — jamais un repli sur
celui du client, c'est précisément ce que la ligne interdit. Et `client` ne veut jamais dire
que le client lui parle en direct : ce chemin contourne le masque, et un fichier ne le rouvre
pas. **`level`, `disable`, `keep`** donnent aux résultats de ce serveur un masquage à eux (un
serveur qui demande le modèle local le demande au démarrage, comme le chat) ; **`writes`**
garde ses outils d'écriture à lui seul. La ligne serveur de la carte et `mcp status` montrent
la politique.

**Une connexion faite via openmasq prend effet maintenant, pas au prochain démarrage.** Le
proxy en cours surveille `~/.openmasq` : `mcp login notion`, `mcp add`, `mcp remove` ou une
édition du fichier des serveurs lui fait résoudre la liste à nouveau — même précédence, même
politique — et reconnecter **seulement ce qui a bougé** ; les autres serveurs gardent leur
connexion et tout appel en cours. L'agent en est averti par `notifications/tools/list_changed`
sur le flux qu'il garde ouvert (Claude Code relit la liste sur ce signal), donc un outil
apparaît, change d'identifiant ou disparaît en pleine session. Les serveurs propres du client
restent désactivés pour toute la session — l'exclusivité se décide une fois, au démarrage —
donc se connecter à Notion ici remplace sur place celui qui avait été repris : l'agent garde
l'outil, et il passe désormais par l'identifiant d'openmasq. La CLI le dit : « the proxy
running on … picks this up now — no restart needed ».

**Ce qu'un serveur plus strict masque reste masqué.** Chaque masker écrit le même vault de
session, et le vault est rejoué avant toute détection — donc un nom qu'un Notion `strict` a
vaulté reste masqué dans un chat `standard` qui ne cherche aucun nom, ses fragments compris :
`Jean Dupont` venu de Notion fait que `Jean` et `DUPONT` seuls sont substitués dans votre
message suivant, en mode `fake` (alias par mot) comme en mode `token` (rejeu aller seulement
des fragments, en capitale initiale et en capitales). Le vault l'emporte sur le niveau, dans
un seul sens.

**Où vivent les identifiants, et comment connecter un service.** Dans `~/.openmasq`, et nulle
part ailleurs : la clé d'API d'un serveur stdio reste dans le fichier de serveurs que vous
avez écrit, et les jetons OAuth d'un service distant sont obtenus par le CLI puis écrits dans
`mcp-auth.enc` — AES-256-GCM, à côté d'un fichier `key` que vous seul pouvez lire. L'agent ne
reçoit ni l'un ni l'autre.

```bash
openmasq-proxy mcp add             # un formulaire : déclarer un serveur, distant ou local
openmasq-proxy mcp remove notion   # le retirer, jetons compris
```

`add` demande au serveur ce dont il a besoin plutôt que de vous le demander. La plupart des
serveurs distants enregistrent un client tout seuls (RFC 7591), si bien que déclarer Notion
ou Sentry tient en une question — l'URL. Le fournisseur qui délivre ses clients à la main est
l'exception, et le formulaire l'annonce avant de demander : les points d'accès MCP de Google
renvoient vers `accounts.google.com`, qui ne publie aucun point d'enregistrement, donc il
leur faut un identifiant client créé dans sa console — et le formulaire propose par défaut
les portées que le point d'accès annonce lui-même. Un serveur local, c'est une commande, ses
arguments, et la clé d'API qu'il veut dans son environnement, saisie sans écho. Le fichier
est écrit en 0600.

```bash
openmasq-proxy mcp status          # ce qui est déclaré, et ce qui est connecté
openmasq-proxy mcp login notion    # ouvre la page de consentement dans votre navigateur
openmasq-proxy mcp logout notion   # oublier les jetons sur cette machine
```

`login` déroule la poignée de main des connecteurs — enregistrement dynamique du client et
PKCE, donc aucune application OAuth à créer — attrape la redirection sur un écouteur
127.0.0.1 lié à cette tentative-là, et range ce qui revient. Ensuite le proxy se reconnecte
seul, en silence : un démarrage qui ouvrirait une page de consentement que personne n'a
demandée serait pire qu'un démarrage qui dit `not signed in — run: openmasq-proxy mcp login
notion`. `mcp status` liste aussi les serveurs déclarés par Claude Code, si bien qu'un service
qu'il avait déjà se connecte ici en une commande.

**Portabilité de ce magasin.** Le chiffrement est le même partout — `node:crypto`,
AES-256-GCM — mais pas les permissions de fichier. Sur **macOS et Linux**, la clé et le
magasin sont écrits en 0600 dans un dossier 0700, et un fichier de serveurs lisible par
d'autres est refusé net. Sur **Windows**, ces bits n'existent pas : Node ne traduit `chmod`
que par l'attribut lecture-seule et ne touche jamais une ACL NTFS, donc le contrôle de mode
est écarté (il refuserait tout fichier) et ce qui protège le magasin est l'ACL que porte déjà
votre dossier de profil. C'est une garantie plus faible ; on la referme avec
`OPENMASQ_PROXY_KEY` — une clé de 32 octets venue de votre propre gestionnaire de secrets,
après quoi aucun fichier de clé n'est écrit. L'app de bureau a une meilleure réponse sur
toutes les plateformes (le trousseau du système, via Electron) ; un CLI Node pur n'y a pas
accès.

**Le regarder en direct, dans un navigateur** — `--console`. Le proxy sert sa propre page (en
anglais, comme le CLI — ses libellés sont le catalogue anglais du produit) sur
la boucle locale : une table de tous les appels, chaque valeur masquée surlignée dans la
couleur de sa catégorie, un récapitulatif par catégorie, un histogramme par minute, et un
tiroir avec le JSON, les données détectées et le contexte. Deux vues : **Appels**, une ligne
par appel, et **Données**, une ligne par valeur avec son substitut, son type et le nombre de
fois où elle est sortie. C'est ainsi qu'on suit une session **enveloppée**, puisque l'outil
possède le terminal.

```bash
openmasq-proxy --console --mcp -- claude
openmasq-proxy --open --mcp -- hermes      # ouvre l'onglet à ta place : hermes efface l'écran en démarrant
openmasq-proxy --console --no-console-reveal -- claude   # substituts et compteurs seulement sur la page
#   console: http://127.0.0.1:8787/console?t=J4JYXzkIDj2v-p7mRF5p9g
```

**Les valeurs réelles sont sur la page par défaut**, à côté de chaque substitut — la page est
l'écran de l'opérateur, en boucle locale, derrière un jeton tiré pour la session, et c'est
ainsi qu'on suit une session enveloppée. Son basculeur « Real values » les cache ;
`--no-console-reveal` les tient entièrement hors de la page (le bouton le dit alors, plutôt
que de basculer sur une rangée de points). `--reveal` est l'opt-in du **terminal**, jamais un
défaut : un historique de terminal se garde, se copie et se journalise, une page non.
**L'adresse porte un jeton tiré pour la session** : la boucle locale n'est pas un
contrôle d'accès, tout processus de la machine peut joindre 127.0.0.1, et sans le jeton la
route répond 404. Rien de ce qu'un masquage a touché n'est conservé — ni disque, ni cache — et
la page ne va rien chercher nulle part : aucune police de CDN, aucun actif distant. La seule
chose écrite est l'adresse elle-même, dans `~/.openmasq/console.url` (0600, à côté du fichier
de clé, supprimé quand le proxy s'arrête), pour que le raccourci ci-dessous la retrouve.

Un second `-- <outil>` rejoint le proxy déjà en cours et ouvre *sa* vue en direct. Si ce
proxy n'en a pas — lancé sans `--console`, ou une version plus ancienne — et que vous en
demandez une (`--console`, `--open`), la session ne le rejoint pas : elle démarre son propre
proxy sur le port libre suivant, le dit sous la carte, et y pointe l'outil.

**L'ouvrir à tout moment — le raccourci.** L'outil possède l'écran, et hermes comme claude
l'effacent en démarrant, carte et adresse comprises. `openmasq-proxy console` ouvre la vue en
direct du proxy en cours, depuis n'importe quel terminal, quel que soit l'outil enveloppé :

```bash
openmasq-proxy console            # ouvre l'onglet ; --url affiche l'adresse à la place
!openmasq-proxy console           # tapé dans claude, opencode ou hermes : une ligne qui commence par ! s'exécute comme commande shell
```

Associé à une touche, il reste à un geste pendant toute la session — tmux `bind-key o
run-shell "openmasq-proxy console"`, kitty `map f9 launch --type=background openmasq-proxy
console`, iTerm2 une touche sur « Run coprocess ». Il n'ouvre que ce qui répond de lui-même :
l'origine est d'abord interrogée sur `/healthz`, et un lien auquel rien ne répond est oublié,
jamais ouvert.

**Suivre une session enveloppée.** L'interface de l'outil possède le terminal, donc les
lignes de requête partent dans un fichier : `~/.openmasq/proxy.log` par défaut, ou
`--log <fichier>`.

```bash
tail -f ~/.openmasq/proxy.log        # dans une seconde fenêtre, pendant que l'outil tourne
```

Une barre vivante sur les dernières lignes de ce même terminal a été essayée, puis retirée.
Les réserver rétrécit la région de défilement, ce qui contraint le défilement — mais **pas**
l'idée que l'outil enveloppé se fait de l'écran : mesuré, un enfant sous une région `1..34`
de 40 lignes déclare toujours `40 100`. Un outil qui repeint une interface plein écran
continue donc d'écrire sur la dernière ligne, et les deux écrivains se déchirent. Réserver
une place qu'un enfant plein écran respecte demande un pseudo-terminal que le proxy ne
possède pas. Pour suivre une session enveloppée avec les valeurs affichées, `--console`
suffit : la page les porte par défaut, et le fichier journal garde les comptes. (`--reveal` à
côté de `--` sans `--console` reste refusé : le seul écran restant serait le fichier.)

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

**Ce que l'on voit** : la marque et une carte encadrée au démarrage — l'aller-retour d'abord
(ce qui part masqué, ce qui revient restauré), puis le niveau et ce qu'il laisse en clair, les
amonts, l'URL de la vue en direct quand `--console` est actif, et les trois lignes `export` —
puis deux lignes par requête — une gouttière colorée
qui dit l'issue avant qu'on ait lu la ligne, le statut, le délai de réponse de l'amont, la
route et l'hôte où elle est partie, puis une barre et une pastille par catégorie aux couleurs
de masquage de l'app. Un pied de page plein reste fixé en bas avec les réglages en cours, les
compteurs, les dernières requêtes en bandeau et les touches.

**Au démarrage**, une seconde et demie sur l'écran alterné : le loader que l'app de bureau
fait tourner pendant qu'elle réfléchit — la marque de masquage qui se déplace, aux teintes de
la palette — posé autour du nom, qui s'écrit lettre à lettre à l'intérieur. L'anneau se ferme,
deux lignes disent ce que ce run masque et ce qu'il laisse en clair, puis la carte s'écrit
ligne à ligne au lieu de tomber d'un bloc.
N'importe quelle touche passe, `--no-splash` (ou `OPENMASQ_PROXY_SPLASH=0`) la désactive, et
elle ne joue jamais pour une machine (`--json`, `--quiet`, un tube, CI).

**Les couleurs** suivent le terminal : 24 bits quand il annonce le truecolor (`COLORTERM`), le
cube 256 sinon, et aucune sous `NO_COLOR`, `TERM=dumb` ou dans un tube. Deux blocs portent leur
propre fond — la marque et la barre du pied de page — et suivent donc le fond du terminal :
`COLORFGBG` décide, `--theme auto|light|dark` (ou `OPENMASQ_PROXY_THEME`) tranche, et un
terminal qui ne publie rien est supposé sombre.

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
