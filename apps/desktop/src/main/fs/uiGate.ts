import { confirmationSurface, type WriteRisk } from "@openmasq/catalog/mcp";
import { getConfirmationMode } from "../mcp/confirmationMode";
import {
  confirmWrite,
  isToolWriteApproved,
  isWriteAutoApproved,
} from "../mcp/writeConfirmWindow";

/**
 * The confirmation gate for the folder browser's MUTATING ops.
 *
 * WHY IT EXISTS AT ALL. Reading a granted folder from the renderer is strict parity with
 * what the renderer can already do (`mcp.callTool("filesystem__read_file")`), so it needs
 * no new gate. Writing is different: main's write gate intercepts `filesystem__write_file`
 * today, and an ungated `localfs:write` would be a way around it. So the UI path is held to
 * the SAME posture — same shared policy (`confirmationSurface`), same un-spoofable window,
 * same session memory. In **standard** mode nothing pops (exactly as for the MCP path, the
 * residual `confirmationPolicy.ts` already states); in **renforcé** the window opens, and
 * « Toujours pour cet outil » makes an editing session bearable without weakening anything —
 * that memory can only ever be armed by a real click on the window main owns.
 *
 * WHY THE RISK IS ASSIGNED HERE rather than by `writeRisk`. That classifier reads a
 * model-supplied tool NAME from a connector whose semantics we may not vouch for. Here the
 * op comes from a closed set we wrote, so the honest input is a stated verdict per op — the
 * POLICY stays single-sourced (rule 9), only the fact feeding it is domain-specific.
 */
export type LocalFsWriteOp = "mkdir" | "rename" | "trash";

/** The one distinction that matters: can the user get their file back?
 *  `mkdir` is purely additive, `rename` moves within the same granted roots (both ends
 *  are resolved, so it cannot move a file OUT), and `trash` goes to the OS Corbeille
 *  rather than `unlink`. All three are recoverable, so they take the quiet path.
 *  (There is no `write` any more — in-app file editing via the sidebar was removed,
 *  and with it the one in-place-overwrite op this gate rated HIGH.) */
const RISK: Record<LocalFsWriteOp, WriteRisk> = {
  mkdir: "low",
  rename: "low",
  trash: "low",
};

/** The name shown on the confirmation window and remembered by « Toujours pour cet outil ».
 *  Distinct from the MCP tool names on purpose: approving a browser op must
 *  not silently approve a model tool, nor the reverse. */
const LABEL: Record<LocalFsWriteOp, string> = {
  mkdir: "dossiers__creer_un_dossier",
  rename: "dossiers__renommer",
  trash: "dossiers__mettre_a_la_corbeille",
};

/** Throws (fail closed) unless the op may proceed. */
export async function assertLocalFsWriteAllowed(
  op: LocalFsWriteOp,
  args: Record<string, unknown>,
): Promise<void> {
  const rule = confirmationSurface(getConfirmationMode(), { risk: RISK[op] });
  if (rule?.surface !== "system-modal") return;
  const toolName = LABEL[op];
  if (isWriteAutoApproved() || isToolWriteApproved(toolName)) return;
  const approved = await confirmWrite({ toolName, args });
  if (!approved) throw new Error("Action refusée.");
}
