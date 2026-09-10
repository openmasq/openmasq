// `--help`, in one place. It is the CLI's own documentation, so it lives beside the parser
// that enforces it rather than inside it — the flags file stays a flags file.
export const USAGE = `openmasq-proxy — mask personal data before it leaves the machine

  openmasq-proxy [--port 8787] [--ner <models dir>] [--mode fake|token]
                 [--openai <origin>] [--anthropic <origin>] [--gemini <origin>]
                 [--level standard|renforce|strict] [--disable email,phone] [--keep A,B]
                 (standard is the default: deterministic pattern rules, no model loaded)
                 [--always "Groupe Delorme:company,FR76 3000…:iban"] [--secrets-file <path>]
                 [--rules-only] [--quiet] [--json] [--log <file>] [--reveal] [--console]
                 [--theme auto|light|dark]
                 [--mcp] [--mcp-config <file>] [--mcp-writes confirm|deny|allow] [--mcp-no-adopt]
  openmasq-proxy [flags] -- claude            run a tool through the proxy, stop with it
                 (codex, gemini, opencode, copilot too — --mcp makes us their only MCP)

Point any OpenAI- or Anthropic-compatible client at http://127.0.0.1:8787 and keep your
own API key: the proxy forwards it untouched, masks the messages on the way out and
restores the reply on the way back. Routes: /v1/chat/completions, /v1/responses,
/v1/embeddings (OpenAI), /v1/messages (Anthropic), /v1beta/models/<m>:generateContent and
:streamGenerateContent?alt=sse (Gemini); prefix with /openai, /anthropic or /gemini to force
a family. Headers: x-openmasq-session (reuse one vault across turns),
x-openmasq-mode (fake|token). Env: OPENMASQ_PROXY_PORT, OPENMASQ_UPSTREAM_OPENAI,
OPENMASQ_UPSTREAM_ANTHROPIC, OPENMASQ_UPSTREAM_GEMINI, OPENMASQ_NER_DIR, OPENMASQ_PROXY_MODE, OPENMASQ_PROXY_LEVEL,
OPENMASQ_PROXY_KEEP, OPENMASQ_PROXY_DISABLED_KINDS, OPENMASQ_PROXY_ALWAYS, OPENMASQ_PROXY_THEME.
Types for --always: name, username, email, phone, company, address, city, id, card, iban, ip, path, dob, secret.

--console serves a live view of what is being masked, at a URL printed on start-up. It is
the way to watch a WRAPPED run: the tool owns the terminal, the console is a browser tab.
Substitutes and counts by default; --reveal adds the real value beside each one, on that
page only — including for a wrapped run (--console --reveal -- <tool>): the page shows
them, the log file keeps counts. The URL carries a per-run token — without it the route is a 404.

--mcp also serves an MCP server at /mcp. The proxy connects to the servers declared in
~/.openmasq/mcp.json (or --mcp-config, Claude Desktop's "mcpServers" shape) and re-exposes
their tools with the values masked: the agent points its MCP client at http://127.0.0.1:8787/mcp,
never holds an integration credential, and never sees a real value. Tool results are masked
into the SAME vault as the chat messages, so one value keeps one substitute across both.
A tool that WRITES stops for a "y" on this terminal (--mcp-writes deny refuses them, allow
passes them); with no terminal to ask, a write is refused. Env: OPENMASQ_PROXY_MCP_CONFIG,
OPENMASQ_PROXY_MCP_WRITES.

With -- claude, codex, gemini, opencode or copilot, --mcp goes further: the client is started
with OUR endpoint as its ONLY MCP server, and the servers it declared are taken over so it
loses nothing — one MCP, exposing every service, all of it masked. --mcp-no-adopt leaves them
behind. Gemini needs the endpoint declared once (gemini mcp add -s user -t http openmasq
<url>/mcp), and the run then allows that one alone. A client whose own MCP servers cannot be
switched off — or one where a project file outranks what we hand it — is SAID SO on start:
its tool calls do not pass through here.`;
