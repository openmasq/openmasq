import { classifyToolWrite } from "@openmasq/catalog/mcp";

/**
 * SECURITY (audit M6): the MAIN-process write heuristic for MCP tool calls.
 *
 * The renderer's `mcpAgent` shows a write-confirmation card (`WriteConfirmCard`) before a
 * MUTATING tool runs — but that lives entirely in the RENDERER, so a renderer XSS could
 * call `mcp.callTool({name:"gmail__send_email", …})` straight over IPC and skip BOTH the
 * confirmation AND (because it never went through the loop) the argument redaction. The
 * renderer is untrusted for security decisions (root CLAUDE.md rule 7), so the confirmation
 * must ALSO be enforced in main: `mcpCallTool` classifies every non-browser tool with
 * {@link isWriteToolName} and routes a risky write to the MAIN-OWNED, un-spoofable
 * confirmation window (`writeConfirmWindow.ts`) per `CONFIRMATION_POLICY`.
 *
 * The v1 renderer-minted approval TOKEN is REMOVED end to end (channel, preload, wiring):
 * it was a fail-open — a renderer XSS could self-mint an approval — so nothing renderer-
 * supplied may influence this gate. Don't reintroduce a token path.
 *
 * Browser tools are handled by their own allow-list + SSRF gate and are EXEMPT here (they
 * are confirmed renderer-side and fire constantly during agentic browsing — a native prompt
 * per click would make the agent browser unusable).
 */

/**
 * Is a tool a WRITE (→ must be confirmed)? Delegates to `classifyToolWrite`
 * (`@openmasq/catalog/mcp` `writeVocabulary.ts`) — the ONE verb vocabulary + classifier
 * the renderer's `isWriteTool` also calls (rule 9: the two hand-kept copies had drifted,
 * with OPPOSITE defaults). Server `annotations` may only RAISE suspicion, never lower it
 * (a compromised server can't mark a mutating tool read-only to skip the gate), and an
 * unknown name is a WRITE (fail closed) — both enforced inside the shared classifier,
 * pinned here by `writeGate.test.ts`.
 */
export function isWriteToolName(
  realName: string,
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean },
): boolean {
  return classifyToolWrite(realName, annotations);
}
