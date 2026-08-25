import { pseudonymize, unredactArgs } from "@openmasq/redact";
import type {
  JsonObject,
  McpConnection,
  McpTool,
  McpToolCall,
  McpToolResult,
  RedactString,
  Vault,
} from "../types";
import { mapContentFiles, mapStrings, type ExtractFile } from "./walk";

export interface RedactingMcpOptions {
  /** Live connections to the real MCP servers (Gmail, etc.). */
  connections: McpConnection[];
  /**
   * Shared vault: placeholder -> original. Reused across tool calls and turns so
   * a given secret keeps a stable placeholder. Mutated in place; persist it with
   * the conversation. Defaults to a fresh object.
   */
  vault?: Vault;
  /**
   * Scrub a tool RESULT string before the model sees it (real -> placeholder).
   * Default: regex `pseudonymize()` against the shared vault — believable FAKES,
   * NOT the visible `[REDACTED_…]` marker (the model normalises those to a bare
   * `[REDACTED]` that `unredact` can't reverse). Inject a model-based
   * `pseudonymize` (with a `complete`) here for free-form PII (names/orgs).
   */
  redactResult?: RedactString;
  /**
   * Restore a tool ARGUMENT string before it hits the real server
   * (placeholder -> real). Default: `unredactArgs()` against the shared vault.
   *
   * Receives the TOOL name as its 3rd arg. ⚠️ Do NOT use it to withhold vault entries from
   * some connector: the OUTSIDE always gets the REAL value (`@openmasq/ui` root rule 11) —
   * a Gmail send must reach the real recipient, and a browser search must query the real
   * value or it answers about nobody. Only the MODEL ever sees a fake. A per-connector
   * un-redaction gate here was exactly the bug that made the agent browser search the
   * placeholder. The hook exists to inject the ENGINE, not to narrow the vault.
   */
  unredactArg?: RedactString;
  /** Always-redact exact strings (e.g. the user's own data) for the default engine. */
  secrets?: string[];
  /** Highlight kinds the user turned off — forwarded to the default engine. */
  disabledKinds?: string[];
  /** Allow-list: exact values never redacted (e.g. connected-integration names). */
  keep?: string[];
  /** Namespace tool names as `${serverId}__${tool}` to avoid collisions. Default true. */
  namespace?: boolean;
  /**
   * Turn a file's BYTES (base64) into extracted plain text. When set, a tool
   * result that returns a file (image data / resource blob) is extracted +
   * redacted into the vault before the model sees it — never the raw bytes.
   * Node-only (PDF/OCR libs), so it's INJECTED by the host, not imported here.
   */
  extractFile?: ExtractFile;
  /**
   * Called for each downloadable file URL found in a tool result's text (e.g. a
   * signed export link). The URL is stripped from the model-facing text and
   * replaced with a placeholder; the host uses this to fetch + display the real
   * file to the user — the signed URL never reaches the model.
   */
  onFileUrl?: (url: string, mimeType: string, tool?: string) => void;
}

interface Route {
  connection: McpConnection;
  /** The tool's real name on its server (un-namespaced). */
  realName: string;
}

const SEP = "__";

/**
 * A redacting MCP **client**: it aggregates tools from one or more MCP servers,
 * hands them to any provider (Anthropic / OpenAI / Mistral), and pipes every
 * tool call through the redaction vault so the model never sees real data:
 *
 *   model -> callTool(args with placeholders)
 *         -> unredact(args)  -> REAL server (Gmail) -> real result
 *         -> redact(result)  -> model (placeholders only)
 *
 * The transport is injected via {@link McpConnection}, so this class is pure and
 * unit-testable with an in-memory fake server.
 */
export class RedactingMcpClient {
  readonly vault: Vault;
  private readonly connections: McpConnection[];
  private readonly namespace: boolean;
  private readonly redactResult: RedactString;
  private readonly unredactArg: RedactString;
  private readonly extractFile?: ExtractFile;
  private readonly onFileUrl?: (url: string, mimeType: string, tool?: string) => void;
  private routes = new Map<string, Route>();

  constructor(opts: RedactingMcpOptions) {
    this.connections = opts.connections;
    this.vault = opts.vault ?? {};
    this.namespace = opts.namespace ?? true;
    const secrets = opts.secrets;
    const disabledKinds = opts.disabledKinds;
    const keep = opts.keep;
    const rawRedact: RedactString =
      opts.redactResult ??
      (async (text, vault) =>
        (await pseudonymize(text, { vault, secrets, disabledKinds, keep })).text);
    // SELF-SAFE result redaction: concurrent `callTool()`s (a turn's parallel read-only
    // calls) each MUTATE the shared vault, so running their redactions in parallel could
    // give one real value two fakes — or two different reals the SAME fake (a lost vault
    // entry → a value leaked in clear). Serialise them through a per-instance promise
    // chain. The network still overlaps (this wraps only the POST-response redaction), so
    // the parallelism win is kept. Every consumer is protected — no external mutex needed
    // (`@openmasq/ui` already serialises too; the double-guard is harmless).
    let redactChain: Promise<unknown> = Promise.resolve();
    this.redactResult = (text, vault, tool) => {
      const run = Promise.resolve(redactChain).then(() => rawRedact(text, vault, tool));
      redactChain = run.catch(() => {});
      return run;
    };
    // URL-encoding-aware: args often carry URLs where a fake sits URL-encoded
    // (`q=Adam+Bernardbqt`), which a literal unredact misses → the fake would leak
    // to the real server. `unredactArgs` restores those too. See its doc.
    this.unredactArg = opts.unredactArg ?? ((text, vault) => unredactArgs(text, vault));
    this.extractFile = opts.extractFile;
    this.onFileUrl = opts.onFileUrl;
  }

  /**
   * Aggregate the tools from every connection, namespacing names by default, and
   * build the routing table used by {@link callTool}.
   */
  async listTools(): Promise<McpTool[]> {
    const routes = new Map<string, Route>();
    const all: McpTool[] = [];
    for (const connection of this.connections) {
      const tools = await connection.listTools();
      for (const tool of tools) {
        const name = this.namespace ? `${connection.id}${SEP}${tool.name}` : tool.name;
        routes.set(name, { connection, realName: tool.name });
        all.push({ ...tool, name, serverId: connection.id });
      }
    }
    this.routes = routes;
    return all;
  }

  /**
   * Run a model-issued tool call against the real server with redaction on both
   * legs. Restores placeholders in the arguments, invokes the server, then
   * re-redacts the reply's text (the vault grows with any newly-seen secrets).
   *
   * `opts.redactText` REPLACES the result redactor for THIS call only. ⚠️ It
   * replaces a fail-closed path, so a caller may pass it ONLY with a function
   * that is itself fail-closed (the browser clear-mode replay escalates back to
   * the full engine on anything sensitive) — and it runs OUTSIDE this instance's
   * vault mutex, so it must either not mutate the vault or serialise itself.
   * The ARG leg is untouched: un-redaction is unconditional (the outside always
   * gets the real value), whatever the result-side policy.
   */
  async callTool(
    call: McpToolCall,
    opts?: { redactText?: (text: string, vault: Vault) => string | Promise<string> },
  ): Promise<McpToolResult> {
    if (this.routes.size === 0) await this.listTools();
    let route = this.routes.get(call.name);
    if (!route) {
      // Tolerate a model that dropped the `${serverId}__` namespace: route to the
      // unique advertised tool whose bare name matches.
      const suffix = `${SEP}${call.name}`;
      const cand = [...this.routes].filter(([k]) => k.endsWith(suffix));
      if (cand.length === 1) route = cand[0][1];
    }
    if (!route) {
      // Return the REAL tool names so a model that guessed a name can self-correct
      // on the next turn (weak models otherwise give up and improvise prose).
      const available = [...this.routes.keys()].join(", ") || "(none connected)";
      throw new Error(`Unknown MCP tool "${call.name}". Available tools: ${available}`);
    }

    // Bind the tool NAME in, exactly as the result path does below: an un-redaction
    // policy is per-CONNECTOR (a browser's args carry data outward to an attacker-chosen
    // host, a Gmail send does not), and concurrent calls must not see each other's tool.
    const args = (await mapStrings(
      call.arguments,
      (text, vault) => this.unredactArg(text, vault, call.name),
      this.vault,
    )) as JsonObject;
    const result = await route.connection.callTool({
      id: call.id,
      name: route.realName,
      arguments: args,
    });
    // Bind the tool NAME into the redaction callbacks per call (not shared state), so a
    // caller's per-connector policy stays correct even when several tool calls redact
    // their results concurrently.
    const content = await mapContentFiles(result.content, {
      redactText: opts?.redactText ?? ((text, vault) => this.redactResult(text, vault, call.name)),
      extractFile: this.extractFile,
      vault: this.vault,
      onFileUrl: this.onFileUrl ? (url, mime) => this.onFileUrl!(url, mime, call.name) : undefined,
    });
    return { ...result, content };
  }

  /** Close every underlying connection. */
  async close(): Promise<void> {
    await Promise.all(this.connections.map((c) => c.close()));
  }
}
