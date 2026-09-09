// What each agent client needs so that OUR endpoint is the ONLY MCP it speaks to, and where
// it declares the servers we take over. Without the first half the feature is theatre: an
// agent that keeps its own MCP connections reaches Gmail directly, with its own credential,
// and nothing on that path is masked.
//
// Nothing here EDITS a user's configuration. Exclusivity is asked for on the command line,
// for the duration of one run, so quitting the proxy restores the client exactly as it was.
// Each client expresses it in its own way, and the differences are the whole content of this
// file — one switch (Claude Code), a per-server override (Codex), an allow-list over what the
// user already declared (Gemini CLI). A client that offers none of the three is NOT listed:
// `start.ts` then says out loud that its own tool calls do not pass through the mask.
import { homedir } from "node:os";
import { basename, join } from "node:path";

/** Where a client declares its own MCP servers: a file, and the path to the map inside it. */
export interface Declaration {
  path: string;
  /** Keys to walk down to the `mcpServers` map (`["projects", cwd, "mcpServers"]`). */
  at: string[];
  /** What to call this source on screen. */
  scope: string;
}

/** One MCP server a client has of its own, however we came to learn of it. */
export interface OwnServer {
  id: string;
  /** Where it came from, for the « taking X over » line. */
  scope: string;
  /** Its endpoint, for an HTTP server — the only way to recognise OURS among the others. */
  url?: string;
  /** The entry in Claude Desktop's shape, ready for `parseServerMap`. */
  raw: unknown;
}

/** What this run can do about the client's own servers. */
export type Exclusivity =
  | { args: string[] }
  /** Possible for this client, but not in the state its configuration is in. `why` is
   *  addressed to the user and names the ONE thing to do once; the run goes on without
   *  exclusivity, and `start.ts` says what that costs. */
  | { blocked: string };

export interface ExclusiveCtx {
  /** Our one-server config file, written for the run (Claude Desktop shape). */
  configPath: string;
  /** Our endpoint, `http://127.0.0.1:<port>/mcp`. */
  url: string;
  /** What the client itself says it has (`own.ts`). */
  own: OwnServer[];
}

export interface AgentClient {
  id: string;
  /** The flags that make our endpoint its only MCP — or why it cannot, in this state. */
  exclusive(ctx: ExclusiveCtx): Exclusivity;
  /** Its own declarations, widest scope first — a duplicate id keeps the first one
   *  (`own.ts`), which is the scope whose credentials the user gave the widest reach. */
  declarations?(cwd: string, home: string): Declaration[];
  /** …or, when its files are not all JSON, the binary is ASKED. Its own resolver is the only
   *  one that sees everything it will load, so this is the better answer where it exists. */
  probe?: { args: string[]; parse(stdout: string): OwnServer[] };
}

/**
 * Claude Code. `--strict-mcp-config` is the client's own switch for "only the servers in
 * --mcp-config, ignore all other MCP configurations" — which is exactly the exclusivity this
 * needs, expressed by the client rather than imposed on its files.
 */
const CLAUDE: AgentClient = {
  id: "claude",
  exclusive: ({ configPath }) => ({
    args: ["--mcp-config", configPath, "--strict-mcp-config"],
  }),
  declarations: (cwd, home) => [
    { path: join(home, ".claude.json"), at: ["mcpServers"], scope: "user" },
    { path: join(home, ".claude.json"), at: ["projects", cwd, "mcpServers"], scope: "local" },
    { path: join(cwd, ".mcp.json"), at: ["mcpServers"], scope: "project" },
  ],
};

/** A `-c` key is a dotted TOML path, and a path segment only addresses a BARE key. An id that
 *  is not one cannot be switched off this way, and half-applied exclusivity is none. */
const CODEX_ID = /^[A-Za-z0-9_-]+$/;

/**
 * Codex. Its configuration is TOML, spread over `~/.codex/config.toml` and a project's own
 * `.codex/config.toml`, so its servers are not read out of a file here — they are ASKED of
 * the binary (`codex mcp list --json`), the one resolver that sees everything Codex loads.
 *
 * There is no single switch, but `-c` overrides do the job exactly: one
 * `mcp_servers.<id>.enabled=false` per server it has, plus ours as an inline table. Measured
 * on 0.149.1: a whole-table override MERGES (ours is added, theirs stay), which is why the
 * disabling is per server and why an id we cannot address blocks rather than half-applies.
 */
const CODEX: AgentClient = {
  id: "codex",
  probe: { args: ["mcp", "list", "--json"], parse: parseCodexList },
  exclusive: ({ url, own }) => {
    const unaddressable = own.filter((s) => !CODEX_ID.test(s.id)).map((s) => s.id);
    if (unaddressable.length)
      return {
        blocked:
          `${unaddressable.join(", ")}: this id cannot be switched off from the command line ` +
          "(a `-c` path addresses a bare TOML key), so exclusivity would be partial — rename " +
          "it in ~/.codex/config.toml, or disable it there for this session",
      };
    return {
      args: [
        // An entry that already IS us is left alone: we re-declare it just below, and two
        // `-c` writes to one server (a key, then the whole table) leave which one wins to
        // the parser rather than to us.
        ...own
          .filter((s) => s.url !== url)
          .flatMap((s) => ["-c", `mcp_servers.${s.id}.enabled=false`]),
        "-c",
        `mcp_servers.openmasq={url=${JSON.stringify(url)}}`,
      ],
    };
  },
};

/**
 * Gemini CLI. `--allowed-mcp-server-names <name…>` is an allow-list the client applies to
 * everything it would otherwise connect to — settings, workspace, extensions — which is the
 * exclusivity. What it does NOT have is a way to be handed a server on the command line, and
 * the one env var that relocates its settings (`GEMINI_CLI_HOME`) moves its CREDENTIALS with
 * them: using it would log the user out to change a tool list.
 *
 * So the proxy has to be declared once, by the user, and this looks for it BY URL rather than
 * by name — the entry is theirs, so the name is theirs too. Nothing found ⇒ blocked, with the
 * command to run; never a silent allow-list of a name that does not exist, which would leave
 * the session with no tools at all.
 */
const GEMINI: AgentClient = {
  id: "gemini",
  declarations: (cwd, home) => [
    { path: join(home, ".gemini", "settings.json"), at: ["mcpServers"], scope: "user" },
    { path: join(cwd, ".gemini", "settings.json"), at: ["mcpServers"], scope: "workspace" },
  ],
  exclusive: ({ url, own }) => {
    const ours = own.find((s) => s.url === url);
    return ours
      ? { args: ["--allowed-mcp-server-names", ours.id] }
      : {
          blocked:
            "gemini takes no MCP server on the command line — declare the proxy once with " +
            `« gemini mcp add -s user -t http openmasq ${url} » and this run makes it the only one`,
        };
  },
};

const CLIENTS: AgentClient[] = [CLAUDE, CODEX, GEMINI];

/** `codex mcp list --json` → the servers it would load. A disabled one is left out: it is not
 *  part of the session, so there is nothing to take over and nothing to switch off. */
export function parseCodexList(stdout: string): OwnServer[] {
  const doc: unknown = JSON.parse(stdout);
  if (!Array.isArray(doc)) throw new Error("expected a JSON array of servers");
  const own: OwnServer[] = [];
  for (const entry of doc) {
    if (typeof entry !== "object" || entry === null) continue;
    const { name, enabled, transport } = entry as Record<string, unknown>;
    if (typeof name !== "string" || enabled === false) continue;
    if (typeof transport !== "object" || transport === null) continue;
    const t = transport as Record<string, unknown>;
    if (typeof t.url === "string") {
      own.push({ id: name, scope: "codex", url: t.url, raw: { type: "http", url: t.url } });
      continue;
    }
    if (typeof t.command === "string")
      own.push({
        id: name,
        scope: "codex",
        raw: { command: t.command, args: t.args ?? [], env: t.env ?? {} },
      });
  }
  return own;
}

/**
 * Which client is being wrapped, by the command's own name. Unknown ⇒ undefined, and the
 * caller SAYS SO rather than assuming: for a client whose own MCP servers we cannot switch
 * off, the honest report is that its tool calls do not pass through here.
 */
export function detectClient(command: string): AgentClient | undefined {
  const name = basename(command).replace(/\.(cmd|exe|bat)$/i, "");
  return CLIENTS.find((c) => c.id === name);
}

export const CLIENT_IDS = CLIENTS.map((c) => c.id);

/** The clients whose servers can be read from a FILE — what `mcp status` can list without
 *  running anybody's binary (a probe spawns the client, which a status command must not). */
export const DECLARING_CLIENTS = CLIENTS.filter((c) => c.declarations);

/** The one-server config handed to the client: our endpoint, and nothing else. */
export function soleServerConfig(url: string): string {
  return `${JSON.stringify({ mcpServers: { openmasq: { type: "http", url: `${url}/mcp` } } }, null, 2)}\n`;
}

/** Read a declaration's map out of a parsed document; undefined when the path is absent. */
export function pick(doc: unknown, at: string[]): unknown {
  let node: unknown = doc;
  for (const key of at) {
    if (typeof node !== "object" || node === null || Array.isArray(node)) return undefined;
    node = (node as Record<string, unknown>)[key];
  }
  return node;
}

export const defaultHome = homedir;
