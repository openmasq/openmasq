// Which tool calls run, and which stop for a human. Hiding the credential removes the
// EXFILTRATION of the secret, not the AUTHORITY it grants: an agent that cannot read the
// Gmail token can still ask for `gmail__send_message`, and a hostile string inside a tool
// result is enough to make it ask. So a write stops here.
//
// The read/write classification and the risk ladder are NOT re-invented: they come from
// `@openmasq/catalog`, the same two functions the desktop app confirms on (rule 9). What
// this file owns is the CLI's own answer — a terminal has no modal, so "high" becomes a
// typed confirmation and an absent terminal becomes a refusal.
import { classifyToolWrite, writeRisk, type WriteRisk } from "@openmasq/catalog/mcp";
import type { McpTool } from "@openmasq/mcp";
import type { WritePolicy } from "../../config/config.js";

export type { WritePolicy };

export type ToolVerdict =
  | { verdict: "allow" }
  | { verdict: "confirm"; risk: WriteRisk }
  | { verdict: "deny"; reason: string };

/** The `${serverId}__${tool}` name split back into its halves. */
export function splitToolName(name: string): { serverId: string; bare: string } {
  const i = name.indexOf("__");
  return i < 0
    ? { serverId: "", bare: name }
    : { serverId: name.slice(0, i), bare: name.slice(i + 2) };
}

/**
 * Decide before the call leaves. `tool` is the advertised tool (namespaced name, server
 * annotations); an UNKNOWN name is a refusal, not a read — a tool we cannot classify is a
 * tool whose blast radius we cannot state.
 */
export function decideTool(name: string, tools: McpTool[], policy: WritePolicy): ToolVerdict {
  const tool = tools.find((t) => t.name === name);
  if (!tool) return { verdict: "deny", reason: `unknown tool "${name}"` };

  const mutates = classifyToolWrite(tool.name, tool.annotations, tool.description);
  if (!mutates) return { verdict: "allow" };

  if (policy === "deny")
    return {
      verdict: "deny",
      reason: `${tool.name} writes, and --mcp-writes deny is on (reads still run)`,
    };

  // `writeRisk` fails closed on a server it does not ship — which is EVERY server declared
  // in a user's own config. That is honest rather than pedantic: the proxy cannot vouch for
  // what `update_status` does on a server it has never seen.
  const risk = writeRisk(tool.name, {
    serverId: tool.serverId,
    annotations: tool.annotations,
  });
  if (policy === "allow") return { verdict: "allow" };
  return { verdict: "confirm", risk };
}

/** Asks the operator. Returns false when it cannot ask — no terminal is a refusal. */
export type ConfirmFn = (ask: ConfirmAsk) => Promise<boolean>;

export interface ConfirmAsk {
  /** The advertised name, `${serverId}__${tool}`. */
  name: string;
  risk: WriteRisk;
  /** The arguments AS THE REAL SERVER WILL RECEIVE THEM — restored, so the human approves
   *  what actually happens, not a masked shadow of it. This is the one place a real value
   *  is shown, and it is the operator's own screen (same rule as `--reveal`). */
  args: unknown;
}

/** Run the verdict. Returns the refusal text, or "" to proceed. */
export async function gateTool(
  name: string,
  tools: McpTool[],
  policy: WritePolicy,
  confirm: ConfirmFn,
  args: unknown,
): Promise<string> {
  const decision = decideTool(name, tools, policy);
  if (decision.verdict === "allow") return "";
  if (decision.verdict === "deny") return `Refused: ${decision.reason}.`;
  const ok = await confirm({ name, risk: decision.risk, args });
  return ok ? "" : `Refused: ${name} was not approved on the operator's terminal.`;
}
