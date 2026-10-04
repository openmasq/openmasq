[Français](README.fr.md)

# @openmasq/proxy

[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](../../LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-339933)](package.json)

**Mask personal data before a request leaves your machine, for any tool that lets you set a base URL.**

The OpenMasq proxy is an OpenAI-, Anthropic- and Gemini-compatible endpoint on `127.0.0.1`.
It runs the same redaction engine as the desktop app: it replaces personal data in each
request with substitutes, forwards the request to the provider, and puts the real values
back in the reply. It is for developers who call models from an SDK, a coding agent, a
notebook or a framework (LangChain, the Vercel AI SDK, Continue…) and want redaction without
the desktop app.

You keep your own API key. The proxy forwards the request's headers untouched and never
stores a key. What it holds is the **vault** (the substitute → real value map), in memory,
on this machine, for the time of a request or a session.

## Install

The proxy lives in this monorepo and is not published on npm. It needs Node.js 20 or later
and pnpm.

```bash
git clone https://github.com/openmasq/openmasq && cd openmasq
pnpm install
pnpm build                       # builds the workspace packages and the proxy
```

The commands below call it `openmasq-proxy`, the name of its `bin`. From the repository
root, either run `node apps/proxy/dist/server.js`, or define an alias:

```bash
alias openmasq-proxy="node $PWD/apps/proxy/dist/server.js"
```

## Quick start

1. Start the proxy. It listens on `http://127.0.0.1:8787`.

   ```bash
   openmasq-proxy                 # or, from source: pnpm --filter @openmasq/proxy dev
   ```

2. Point your tool at it, in another shell (press `c` in the proxy to copy these lines):

   ```bash
   export OPENAI_BASE_URL=http://127.0.0.1:8787/v1
   export ANTHROPIC_BASE_URL=http://127.0.0.1:8787
   export GOOGLE_GEMINI_BASE_URL=http://127.0.0.1:8787
   ```

3. Use the tool as usual. The proxy lists each request with the masked categories and
   their counts, never a value.

Or let the proxy start the tool for you, with the base URLs already set:

```bash
openmasq-proxy -- claude
```

> [!IMPORTANT]
> The default level, `standard`, uses deterministic pattern rules only. It masks e-mails,
> phone numbers, cards, IBANs, national and company identifiers, IP addresses, keys and
> secrets. **Names, companies, addresses and places are not masked at `standard`.** Run
> `--level renforce` for those (see [Redaction levels](#redaction-levels)).

## Table of contents

- [Features](#features)
- [How it works](#how-it-works)
- [Redaction levels](#redaction-levels)
- [Run a tool through the proxy](#run-a-tool-through-the-proxy)
- [MCP integrations](#mcp-integrations)
- [Configuration file](#configuration-file)
- [Live console](#live-console)
- [Terminal](#terminal)
- [Reference](#reference)
- [Security](#security)
- [Development](#development)

## Features

- **Three wire formats**: OpenAI (Chat Completions, Responses, Embeddings), Anthropic
  (Messages, token counting) and Gemini (`generateContent`, streaming included).
- **Streaming restore**: a streamed reply is restored frame by frame. A substitute split
  across two chunks is held back until it can be restored whole.
- **Tool calls**: tool-call arguments are restored before your code runs them, URL-encoded
  forms included, so the outside always gets the real value.
- **Same levels as the app**: `standard`, `renforce` and `strict`, with the same category
  sets, plus per-kind switches, a keep list, always-masked terms and a secrets file.
- **On-device model**: names, companies, addresses and places come from the local NER
  model, verified by sha256 before it loads and never downloaded.
- **Wrapped tools**: `openmasq-proxy -- <tool>` starts a tool with its base URLs pointed at
  the proxy, and stops when the tool exits.
- **MCP integrations**: with `--mcp`, the proxy holds your MCP servers and their
  credentials, and the agent gets the same tools with the values masked.
- **Live console**: with `--console`, a browser page on loopback shows every call and what
  was masked in it.
- **One settings file**: every option can be set once in `~/.openmasq/proxy.json`, per run
  or per wrapped tool.

## How it works

```
your tool ──request──▶ proxy: mask ──▶ provider ──reply──▶ proxy: restore ──▶ your tool
```

**What is masked**: system and user text, the assistant history, tool results, and the
arguments of tool calls already in the history.

**What is restored**: the reply's text, and the arguments of the tool calls in the reply.

### Routes

The routes form an allow-list. A `POST` the proxy does not know how to mask is answered
with `501` and never forwarded.

| Family | Routes |
|---|---|
| OpenAI | `POST /v1/chat/completions`, `/v1/responses`, `/v1/embeddings` |
| Anthropic | `POST /v1/messages`, `/v1/messages/count_tokens` |
| Gemini | `POST /v1beta/models/<model>:generateContent`, `:streamGenerateContent` (also under `/v1` and `/v1alpha`) |
| Passthrough | `GET`, `HEAD` and `DELETE` carry no text and are relayed as is (`GET /v1/models`…) |

- Prefix a route with `/openai`, `/anthropic` or `/gemini` to force its family.
- Prefix it with `/s/<session>` to use a named session (this is how wrapped tools get a
  vault each).
- `GET /healthz` reports the level, whether the model is loaded, the mode and whether a
  live console is served.

### Headers

| Header | Direction | Effect |
|---|---|---|
| `x-openmasq-session: <id>` | request | Reuses one vault across turns: the same value gets the same substitute. A session is dropped after one hour without a request. |
| `x-openmasq-mode: fake\|token` | request | What the model sees: a believable substitute (`fake`, the default) or an opaque token. |
| `x-openmasq-masked: <count>` | reply | How many values were masked in the request. |

### What a substitute keeps

A substitute keeps what the model needs to reason, so what it derives stays true of the
real value:

- an IP keeps its class and neighbourhood (two hosts of one /24 stay on one substitute /24,
  and a subnet the model writes back is restored to the real network);
- an e-mail keeps its domain extension, and colleagues share one substitute domain;
- a phone number keeps its country code and its mobile or landline class;
- a card keeps its network, and an IBAN its country (and still validates).

## Redaction levels

```bash
openmasq-proxy --level renforce
```

| Level | What is masked | Model |
|---|---|---|
| `standard` (default) | E-mails, phones, cards, IBANs, national and company identifiers, IPs, API keys and secrets | None. Starts instantly. |
| `renforce` | `standard`, plus names, dates of birth, companies, addresses, places and `@handles` | Required |
| `strict` | Everything, including file paths, URLs and plain dates | Required |

> [!WARNING]
> Above `standard` the model reasons on substitutes, so **an answer about a person or an
> organisation can differ** from the one it would give about the real one. The startup card
> says so.

- `renforce` spares famous brands and public figures (world knowledge, not your data).
  `strict` spares nothing.
- The vendors' own names (Anthropic, Claude, OpenAI, ChatGPT, Codex, Google, Gemini,
  GitHub, Copilot) stay in clear at every level: a coding agent's system prompt names them
  on every call.
- File paths are masked only at `strict`. A path is replaced segment by segment, which
  breaks the commands a coding agent runs.

Adjust a level with these options:

| Option | Effect |
|---|---|
| `--disable email,phone` | Leaves these kinds in clear, on top of what the level leaves. |
| `--keep Stripe,Canva` | Never masks these exact values. |
| `--always "Groupe Delorme:company,FR76 3000…:iban"` | Always masks these terms, whatever the detectors find (the app's Vault). Types: `name`, `username`, `email`, `phone`, `company`, `address`, `city`, `id`, `card`, `iban`, `ip`, `path`, `dob`, `secret`. A term without a type is a `name`. |
| `--secrets-file <path>` | Always erases the exact strings in this file, one per line. |
| `--mode fake\|token` | What the model sees in place of a value. |

### The on-device model

`renforce` and `strict` need the on-device NER model, and the proxy refuses to start
without it. It never downloads the model. It loads the desktop app's bundle, built by:

```bash
pnpm --filter @openmasq/desktop bake:ner
```

In a checkout the proxy finds `apps/desktop/build/ner-models` on its own. Elsewhere, pass
`--ner <dir>` (or `OPENMASQ_NER_DIR`) with the bundle's root folder. The weights are checked
against pinned sha256 hashes before onnxruntime reads them. If the model fails on a request,
the proxy answers `502` and forwards nothing.

> [!WARNING]
> `--rules-only` runs pattern rules alone at any level: names, companies and places are then
> not detected. The proxy says so on every start.

## Run a tool through the proxy

```bash
openmasq-proxy -- claude
openmasq-proxy --level renforce -- codex
```

Everything after `--` is a command. The proxy starts it with `OPENAI_BASE_URL`,
`ANTHROPIC_BASE_URL` and `GOOGLE_GEMINI_BASE_URL` pointed at itself, gives it the terminal,
and stops when it exits. Meanwhile the request lines go to `~/.openmasq/proxy.log` (or
`--log <file>`, written 0600 and rotated at 4 MB), and the summary prints after the tool
closes.

```bash
tail -f ~/.openmasq/proxy.log    # in a second window
```

A second `-- <tool>` joins the proxy already running, with a vault of its own, and uses
that proxy's settings. If you ask for a live view (`--console` or `--open`) and the running
proxy has none, the new run starts its own proxy on the next free port and says so.

**Coding agents.** Setup per tool, with what was actually tested, is in
[`examples/README.md`](examples/README.md):

- **Claude Code** honours `ANTHROPIC_BASE_URL`.
- **Codex** needs a `model_providers` block with `wire_api = "responses"`. A bare
  `OPENAI_BASE_URL` leaves it on its stored ChatGPT login.
- **Gemini CLI** reads `GOOGLE_GEMINI_BASE_URL` in API-key mode (not verified).
- **Hermes** reads its base URL from `~/.hermes/config.yaml` only, so it is redirected when
  you wrap it with `--mcp` (see [MCP integrations](#one-mcp-server-for-the-wrapped-agent)).

> [!TIP]
> For a coding agent, add the brand names its system prompt cites to `--keep`.

## MCP integrations

With `--mcp`, the proxy also serves an MCP server at `http://127.0.0.1:8787/mcp`. Point your
agent's MCP client there instead of at Gmail, Notion or your CRM. The proxy holds the
connections and the credentials, and the agent gets the same tools with the values masked.

```bash
openmasq-proxy --mcp --level renforce          # servers from ~/.openmasq/mcp.json
```

```jsonc
// ~/.openmasq/mcp.json, chmod 600. Claude Desktop's shape: an existing file works as is.
{ "mcpServers": {
  "crm":    { "command": "npx", "args": ["-y", "crm-mcp"], "env": { "CRM_TOKEN": "sk-…" } },
  "notion": { "url": "https://mcp.notion.com/mcp", "headers": { "Authorization": "Bearer …" } }
} }
```

- **No credential reaches the agent**, and no real value either. A tool result is masked on
  the way back, and the substitute the agent sends next is restored on the way out, so a
  search runs on the real name.
- **One vault for both channels.** Tool results and chat messages share the session vault,
  so a value keeps one substitute across both.
- **The endpoint has a key.** It runs tools with your credentials, so it requires the token
  in `~/.openmasq/mcp.token` (0600, stable across runs), as `?t=<token>` or the
  `x-openmasq-mcp-token` header. Without it the route answers `404`. A wrapped client is
  handed the URL with the token in it.
- **Standard transport.** The endpoint is streamable HTTP, so any MCP client can use it.

### Writes need your approval

Hiding a credential does not remove the authority it grants: an instruction injected in a
tool result can still ask for `send_message`. So a tool that writes stops for a key on your
terminal (`y` runs it, anything else refuses). With no terminal to ask, a write is refused.

| `--mcp-writes` | Effect |
|---|---|
| `confirm` (default) | Asks on the terminal. |
| `deny` | Refuses every write and keeps the reads. |
| `allow` | Passes writes. The startup card says so in amber. |

### One MCP server for the wrapped agent

```bash
openmasq-proxy --mcp -- claude
```

When you wrap a known client with `--mcp`, the proxy starts it with its own endpoint as the
client's **only** MCP server, and takes over the servers the client declared so the session
loses nothing. Your files are not edited: quitting restores the client exactly.
`--mcp-no-adopt` leaves the client's servers out.

| Client | How exclusivity is requested | Setup |
|---|---|---|
| **Claude Code** | `--mcp-config <temp> --strict-mcp-config` | None |
| **Codex** | One `-c mcp_servers.<id>.enabled=false` per server it lists, ours, and `features.apps=false` for its built-in apps server | None. `codex exec` needs `-c 'mcp_servers.openmasq.default_tools_approval_mode="approve"'` to call a tool non-interactively. |
| **Gemini CLI** | `--allowed-mcp-server-names <ours>` | Once: `gemini mcp add -s user -t http openmasq "http://127.0.0.1:8787/mcp?t=$(cat ~/.openmasq/mcp.token)"`. Wrap a session, not a subcommand (`gemini mcp list` refuses the flag). |
| **opencode** | A config file in `OPENCODE_CONFIG`: ours added, each of its own disabled | None. A project `opencode.json` can outrank that file, so the proxy checks again under its config and refuses exclusivity if a server survived. Refused if `OPENCODE_CONFIG` is already set. |
| **Copilot CLI** | One `--disable-mcp-server <id>` per server, `--disable-builtin-mcps`, and ours through `--additional-mcp-config` | None |
| **Hermes** | A temporary `HERMES_HOME`: your `config.yaml` with `model.base_url` pointed at the proxy and our endpoint as its only MCP server; everything else linked back from `~/.hermes` | Run `hermes setup` once |

> [!WARNING]
> Any other client keeps its own MCP servers, and **those tool calls do not pass through
> the mask**. The proxy says so on start. Point that client at `/mcp` yourself and switch
> its other servers off. The same warning appears when exclusivity cannot be applied (for
> example, a server id Codex cannot address from the command line).

A remote server the client authorised itself cannot be taken over, because its OAuth token
lives in the client's store. Declare it in `~/.openmasq/mcp.json` and sign in here instead.

> [!NOTE]
> A client's own `mcp list` command prints every configured server: it reads the
> configuration, not the session.

### Connect a service

```bash
openmasq-proxy mcp add             # a form: declare a remote or local server
openmasq-proxy mcp status          # what is declared, and what is signed in
openmasq-proxy mcp login notion    # opens the consent page in your browser
openmasq-proxy mcp logout notion   # forgets its tokens on this machine
openmasq-proxy mcp remove notion   # drops it from the servers file, tokens included
```

- **`add`** asks the server what it needs. Most remote servers register a client on their
  own (RFC 7591), so declaring Notion or Sentry takes one answer: the URL. A provider with no
  registration endpoint (Google) needs a client id from its console, and the form offers
  the scopes the endpoint advertises. A local server is a command, its arguments and any API
  key it needs, typed without echo. The file is written 0600.
- **`login`** runs dynamic client registration and PKCE, so you create no OAuth app. It
  catches the redirect on a 127.0.0.1 listener bound to that one attempt. A later start
  reconnects silently and never opens a consent page on its own.
- **`status`** also lists the servers Claude Code declares, so you can sign one in here in
  one command.

**Changes apply to the running proxy.** It watches `~/.openmasq`: `mcp login`, `mcp add`,
`mcp remove` or an edit of the servers file makes it resolve the list again and reconnect
only what changed. The agent is told through `notifications/tools/list_changed`. A new or
changed **local** server is the exception: starting a process is left to the next start.

### Where credentials are stored

Only in `~/.openmasq`. A local server's API key stays in the servers file you wrote. A
remote server's OAuth tokens go to `mcp-auth.enc`, encrypted with AES-256-GCM under a `key`
file only you can read.

| Platform | Protection |
|---|---|
| macOS, Linux | Key and store written 0600 in a 0700 directory. A key, store or servers file other users can read is refused. |
| Windows | Node cannot read or set NTFS ACLs, so the mode check is skipped and your profile directory's ACL protects the store. Set `OPENMASQ_PROXY_KEY` (32 bytes, hex or base64, from your own secret manager) and no key file is written. |

> [!NOTE]
> The desktop app keeps these secrets in the OS keychain. The proxy is pure Node and cannot
> reach it.

## Configuration file

Every option can be written once in `~/.openmasq/proxy.json` instead of typed on every run.
The file holds no secret (the servers file keeps those), so you can share or version it.

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

- **`run`** applies to every run. Keys are the option names in the [reference](#reference)
  table (`level`, `mcpWrites`, `rulesOnly`…). A `--no-…` flag is the same key set to
  `false` (`"splash": false`).
- **`clients.<tool>`** overrides `run` for one wrapped tool.
- **Precedence**: flag > environment variable > `clients.<tool>` > `run` > default.
- `reveal` and `json` are per-run flags only and cannot be set in the file.
- `--config <file>` or `OPENMASQ_PROXY_CONFIG` names another file.

> [!IMPORTANT]
> A malformed file refuses the start: an unknown section, an unknown or misspelt key (the
> error names the closest one), or a value outside the choices. A bad environment variable
> refuses it too. A `"level": "strcit"` that silently ran at `standard` would be a leak.

**The `mcp` section** sets a policy per server:

| Key | Values | Effect |
|---|---|---|
| `source` | `openmasq` | Your server, from the servers file. The client's server of the same name is set aside. If your file does not declare it, the run goes without it (said in amber), never falls back to the client's. |
| | `client` | The client's server, taken over through the proxy. It never means the client talks to it directly. |
| | `off` | Neither: the tool is absent from the run. |
| | (omitted) | Yours when declared, the client's otherwise. |
| `level`, `disable`, `keep` | as the options | Masking for that server's results. A server whose level needs the model loads it at start. |
| `writes` | `confirm`, `deny`, `allow` | The write gate for that server alone. |

The startup card and `mcp status` show each server's policy. What a stricter server masks
stays masked: every server writes the same session vault, and the vault is applied before
detection. A name a `strict` Notion masked stays masked in a `standard` chat, and so do its
parts (`Jean` or `DUPONT` alone), in `fake` and `token` mode.

```bash
openmasq-proxy config init      # writes an empty proxy.json and its JSON Schema beside it
openmasq-proxy config edit      # opens it, then checks it when the editor closes
openmasq-proxy config show      # the run that would start, and where each value came from
openmasq-proxy config path      # the file it reads
openmasq-proxy config schema    # prints the JSON Schema
```

`config edit` uses `$VISUAL` or `$EDITOR`, else the first installed of Cursor, VS Code, Zed,
Sublime Text, Windsurf (with `--wait`; on macOS their bundled CLI is found without the shell
command), nano, vim, vi. `config show --json` prints machine-readable output.

## Live console

```bash
openmasq-proxy --console --mcp -- claude
openmasq-proxy --open --mcp -- hermes                    # opens the tab before the tool starts
openmasq-proxy --console --no-console-reveal -- claude   # substitutes and counts only
#   console: http://127.0.0.1:8787/console?t=J4JYXzkIDj2v-p7mRF5p9g
```

`--console` serves a page on loopback: a table of every call with each masked value marked
in its category's colour, a recap by category, a per-minute histogram, and a drawer with the
JSON, the detected values and their context. Two views: **Calls**, one row per call, and
**Data**, one row per value with its substitute, type and count. The page is in English. It
is how you watch a wrapped run, since the tool owns the terminal. `--open` implies
`--console` and opens the tab for you.

- **Real values are shown by default**, beside each substitute. The page's **Real values**
  toggle hides them. `--no-console-reveal` keeps them off the page entirely.
- **The URL carries a token minted for the run.** Loopback is not access control: any
  process on the machine can reach 127.0.0.1. Without the token the route answers `404`.
- **Nothing is stored and nothing is fetched.** The page loads no remote font or asset. The
  only file written is the address, in `~/.openmasq/console.url` (0600, removed when the
  proxy exits).

**Reopen it at any time.** Wrapped tools such as `claude` and `hermes` clear the screen as
they start, URL included. This opens the running proxy's live view from any terminal:

```bash
openmasq-proxy console           # opens the tab; --url prints the address instead
!openmasq-proxy console          # typed in claude, opencode or hermes (a leading ! runs a shell command)
```

Bind it to a key: tmux `bind-key o run-shell "openmasq-proxy console"`, kitty
`map f9 launch --type=background openmasq-proxy console`, or an iTerm2 key mapped to « Run
coprocess ». It asks the proxy's `/healthz` first. A link nothing answers for is deleted,
not opened.

## Terminal

At start the proxy shows a short opening sequence, then a card: what leaves masked and what
comes back restored, the level and what it leaves in clear, the upstreams, the console URL
when it is on, and the three `export` lines. Then each request gets a line with its outcome,
status, upstream response time, route and host, and a count per category in the app's
redaction colours (`NAME 2 · EMAIL 1`). Never a value, never the query string. A footer
shows the live settings and counts. Ctrl-C prints the session totals.

**Keys**, on an interactive terminal:

| Key | Action |
|---|---|
| `l` | Cycle the level (refused if the level needs a model that is not loaded and cannot load) |
| `m` | Switch between substitutes and tokens |
| `f` | Show what each value became |
| `c` | Copy the three `export` lines |
| `s` | Print the summary so far |
| `x` | Clear |
| `?` | List the keys |
| `q` | Quit |

No key opens a route in clear.

**Seeing real values.** `--reveal` (or `f`) prints one line per value under each request,
such as `NAME  Camille Roussel → Armelle Aubertin`. It is the only place the proxy prints a
real value. It is refused with `--json`, and with `-- <tool>` unless `--console` is on (the
values then go to the console page only, and the log keeps counts). A scrollback is kept and
copied, a page is not.

**Output and colours.** `--quiet` drops the request lines. `--json` writes one JSON object
per request on stdout, for a log collector. Colours are 24-bit when the terminal announces
it (`COLORTERM`), 256 colours otherwise, and off under `NO_COLOR`, `TERM=dumb` or a pipe.
The background follows `COLORFGBG`. Override it with `--theme auto|light|dark`. A terminal
that says nothing is assumed dark. The opening sequence is skipped with `--no-splash`, by any
key, and always for a machine (`--json`, `--quiet`, a pipe, CI).

## Reference

```bash
openmasq-proxy [options] [-- <command…>]
openmasq-proxy --help
```

<details>
<summary><b>Every option</b>: flag, environment variable and <code>proxy.json</code> key</summary>

| Flag | Environment variable | File key | Default | Description |
|---|---|---|---|---|
| `--port <n>` | `OPENMASQ_PROXY_PORT` | `port` | `8787` | Loopback port to listen on |
| `--openai <origin>` | `OPENMASQ_UPSTREAM_OPENAI` | `openai` | `https://api.openai.com` | OpenAI-wire upstream |
| `--anthropic <origin>` | `OPENMASQ_UPSTREAM_ANTHROPIC` | `anthropic` | `https://api.anthropic.com` | Anthropic-wire upstream |
| `--gemini <origin>` | `OPENMASQ_UPSTREAM_GEMINI` | `gemini` | `https://generativelanguage.googleapis.com` | Gemini-wire upstream |
| `--ner <dir>` | `OPENMASQ_NER_DIR` | `ner` | dev bake if present | The on-device model's directory |
| `--rules-only` | | `rulesOnly` | off | Pattern rules alone, at any level |
| `--mode fake\|token` | `OPENMASQ_PROXY_MODE` | `mode` | `fake` | What the model sees in place of a value |
| `--level <level>` | `OPENMASQ_PROXY_LEVEL` | `level` | `standard` | `standard`, `renforce` or `strict` |
| `--disable <kinds>` | `OPENMASQ_PROXY_DISABLED_KINDS` | `disable` | | Kinds left in clear, on top of the level |
| `--keep <values>` | `OPENMASQ_PROXY_KEEP` | `keep` | | Exact values never masked |
| `--always <terms>` | `OPENMASQ_PROXY_ALWAYS` | `always` | | Terms always masked (`value:type`) |
| `--secrets-file <path>` | | `secretsFile` | | Exact strings always erased, one per line |
| `--quiet` | | `quiet` | off | No line per request |
| `--json` | | (flag only) | off | One JSON object per request on stdout |
| `--reveal` | | (flag only) | off | Real values on this terminal |
| `--log <file>` | | `log` | `~/.openmasq/proxy.log` | Request lines during a wrapped run |
| `--mcp` | | `mcp` | off | Serve `/mcp` |
| `--mcp-config <file>` | `OPENMASQ_PROXY_MCP_CONFIG` | `mcpConfig` | `~/.openmasq/mcp.json` | The servers file (implies `--mcp`) |
| `--mcp-writes <policy>` | `OPENMASQ_PROXY_MCP_WRITES` | `mcpWrites` | `confirm` | `confirm`, `deny` or `allow` |
| `--mcp-no-adopt` | | `mcpAdopt` | adopt | Do not take over the wrapped client's servers |
| `--console` | | `console` | off | Serve the live view at `/console` |
| `--no-console-reveal` | `OPENMASQ_PROXY_CONSOLE_REVEAL` | `consoleReveal` | reveal | Substitutes only on the console page |
| `--open` | `OPENMASQ_PROXY_OPEN` | `open` | off | Open the live view in the browser (implies `--console`) |
| `--no-splash` | `OPENMASQ_PROXY_SPLASH` | `splash` | play | Skip the opening sequence |
| `--theme <theme>` | `OPENMASQ_PROXY_THEME` | `theme` | `auto` | `auto`, `light` or `dark` |
| `--config <file>` | `OPENMASQ_PROXY_CONFIG` | | `~/.openmasq/proxy.json` | The settings file |

Boolean environment variables take `1`/`0`, `true`/`false`, `yes`/`no` or `on`/`off`.
`OPENMASQ_PROXY_KEY` sets the credential store's encryption key (see
[Where credentials are stored](#where-credentials-are-stored)).

</details>

<details>
<summary><b>Subcommands</b></summary>

| Command | Effect |
|---|---|
| `openmasq-proxy console [--url]` | Open (or print) the running proxy's live view |
| `openmasq-proxy config show\|path\|init\|edit\|schema` | Inspect and edit `proxy.json` |
| `openmasq-proxy mcp status\|add\|remove\|login\|logout` | Manage MCP servers and their sign-in |

`mcp` takes `--config <file>` for another servers file and `--no-adopt` to ignore the
servers Claude Code declares.

</details>

<details>
<summary><b>Files in <code>~/.openmasq</code></b></summary>

| File | Content |
|---|---|
| `proxy.json` | Settings (no secret) |
| `mcp.json` | MCP servers and their API keys (0600) |
| `mcp-auth.enc`, `key` | Encrypted OAuth tokens and their key (0600) |
| `mcp.token` | The `/mcp` endpoint's key (0600) |
| `console.url` | The live view's address while the proxy runs (0600) |
| `proxy.log` | Request lines of wrapped runs: counts, categories, routes and timings (0600) |

</details>

## Security

- **Loopback only, by design.** The proxy binds `127.0.0.1` and there is no flag to change
  it: on a network interface it would expose both the caller's key and the vault. It also
  refuses (`403`) a request whose `Host` or `Origin` is not a loopback name.
- **One key per vault.** Every vault has its own 256-bit key and every substitute is an
  HMAC under it: knowing one value and its substitute tells nothing about another.
- **Nothing a redaction touched is written to disk.** Vaults live in memory. The log holds
  counts, categories, routes and timings, never a value.
- **Fail closed.** A level that needs the model does not start without it, a model failure
  answers `502`, and an unknown `POST` answers `501`. Nothing is forwarded in clear.

> [!NOTE]
> The proxy masks text only. An image, a PDF or a file sent as bytes (`inlineData`,
> `image_url`) passes as is. The desktop app does document OCR and masking; the proxy does
> not.

The threat model for the whole project is in [`SECURITY.md`](../../SECURITY.md).

## Development

```bash
pnpm --filter @openmasq/proxy dev          # run from source (tsx)
pnpm --filter @openmasq/proxy build        # dist/, console assets included
pnpm --filter @openmasq/proxy preview:ui   # draws the terminal screen with made-up data (add "light")
pnpm bench:proxy                           # utility bench: real `claude -p` calls on your subscription
```

The root `pnpm test` includes `apps/proxy/src/**/*.test.ts`. Read
[`CLAUDE.md`](CLAUDE.md) before a change: it maps where each thing lives and the invariants
the tests pin. The bench is described in [`bench/README.md`](bench/README.md), and a design
sketch for LiteLLM in [`examples/litellm/README.md`](examples/litellm/README.md).

## License

[Apache License 2.0](../../LICENSE).
