// Where a tool call meets the vault. One `RedactingMcpClient` per request, bound to THAT
// request's vault and key, so the fake a tool result gets is the same fake the model already
// saw in the conversation — and the same one `restoreReply` will turn back on the way out.
// One vault, two channels: the model calls of `/v1/*` and the tool calls of `/mcp`.
//
//   agent ──callTool(args carrying fakes)──▶ bridge
//     1. restoreArgs   fake ──▶ real         (rule 11: the outside gets the real value)
//     2. the GATE, on those real args        (a write stops for a human)
//     3. the real MCP server runs, with the credential the agent never saw
//     4. mask(result)  real ──▶ fake         (the shared vault grows)
//   agent ◀──result carrying fakes───────────┘
import { mapStrings, RedactingMcpClient, type McpTool, type McpToolResult } from "@openmasq/mcp";
import type { RedactionMatch, Vault } from "@openmasq/redact";
import type { Masker } from "../../lib/masker.js";
import type { ConfirmFn } from "./gate.js";
import { gateTool, type WritePolicy } from "./gate.js";
import type { Upstream } from "./upstream.js";

/** The per-request redaction state, the same object `routes/middlewares/session.ts` puts on
 *  `res.locals` for a model call. */
export interface SessionState {
  vault: Vault;
  key: string;
  mode: "fake" | "token";
}

export interface BridgeDeps {
  upstream: Upstream;
  masker: Masker;
  policy: WritePolicy;
  confirm: ConfirmFn;
}

export interface ToolOutcome {
  result: McpToolResult;
  /** What was masked on the way back — for the audit line, never a value on its own. */
  matches: RedactionMatch[];
  /** Set when the gate stopped the call. */
  refused?: boolean;
}

export interface McpBridge {
  listTools(): Promise<McpTool[]>;
  callTool(
    name: string,
    args: Record<string, unknown>,
    session: SessionState,
  ): Promise<ToolOutcome>;
}

/** A refusal the AGENT can read: it must learn that the call did not happen, and why, or it
 *  will report success to the user. It is an `isError` result, never a dropped connection. */
const refusal = (text: string): McpToolResult => ({
  content: [{ type: "text", text }],
  isError: true,
});

export function createBridge(deps: BridgeDeps): McpBridge {
  return {
    listTools: () => deps.upstream.tools(),

    async callTool(name, args, session) {
      const tools = await deps.upstream.tools();
      const matches: RedactionMatch[] = [];

      // Restore first, so the human confirms what the server will actually receive — not a
      // masked shadow of it. `unredactArgs` is idempotent, so the client's own arg leg
      // below is a no-op on an already-restored string.
      const realArgs = (await mapStrings(
        args as Record<string, never>,
        (text, vault) => deps.masker.restoreArgs(text, vault),
        session.vault,
      )) as Record<string, unknown>;

      const stop = await gateTool(name, tools, deps.policy, deps.confirm, realArgs);
      if (stop) return { result: refusal(stop), matches, refused: true };

      const client = new RedactingMcpClient({
        connections: deps.upstream.connections(),
        vault: session.vault,
        // The proxy's OWN engine, under the session's key: a value masked here and a value
        // masked in a chat message must land on the same fake, or the reply cannot be
        // restored. Passing the key is what makes the two channels agree.
        redactResult: async (text, vault) => {
          const out = await deps.masker.mask(text, vault, session.mode, session.key);
          matches.push(...out.matches);
          return out.text;
        },
        unredactArg: (text, vault) => deps.masker.restoreArgs(text, vault),
      });

      // Both sides namespace the SAME way — the transport returns bare names and each
      // adds one `${serverId}__` — so the name the agent called routes straight through.
      const result = await client.callTool({ name, arguments: args as never });
      return { result, matches };
    },
  };
}
