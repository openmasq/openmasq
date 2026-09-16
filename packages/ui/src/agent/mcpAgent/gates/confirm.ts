import { updateDebug } from "../../../state/debug/debug";
import { isWebBrowseTool } from "../../../state/browserPolicy";
import { isSearchTool } from "../../mcpAgentClassify";
import { isAbortError, raceAbort } from "../../mcpAgentAbort";
import { confirmActLabel } from "../../mcpAgentGuidance";
import { deredactArgs } from "../../mcpAgentUtil";
import type { CallDecision, ConnectorCall, Step } from "../call";
import type { LoopCtx } from "../context";

/**
 * Pre-search REVEAL gate: the FIRST web-search / browser tool of the send pauses so the user
 * picks which categories to reveal for the conversation. Once per send; skipped while the call
 * is clear-mode, and unless the query carries a value in an OFFERABLE category. It governs what
 * the MODEL sees — the query always carries the real value (rule 11).
 */
export async function revealGate(ctx: LoopCtx, c: ConnectorCall, d: CallDecision): Promise<Step | "go"> {
  const { p, st } = ctx;
  const { call, args, bareTool, connectorId } = c;
  if (d.missing.length || d.navBlocked || d.navFake || d.navClear || !ctx.navCarriesOfferable(args)) return "go";
  if (!p.confirmWebNav || st.webNavAsked || !isSearchTool(call.name)) return "go";
  st.webNavAsked = true;
  const phase = ctx.dbg({ type: "phase", scope: "confirm", label: `Choix de redaction (recherche web) · ${bareTool}`, detail: connectorId });
  try {
    await raceAbort(p.confirmWebNav(), p.signal);
  } catch (e) {
    if (ctx.aborted() || isAbortError(e)) {
      updateDebug(phase, { label: `Choix de redaction interrompu · ${bareTool}`, ok: false });
      return ctx.finalizeAborted(), "stop";
    }
    throw e;
  }
  updateDebug(phase, { label: `Redaction confirmé · ${bareTool}`, ok: true });
  // The history was wired BEFORE the gate: un-fake the revealed tokens across the whole
  // context, or the model researches the fake for the rest of the turn.
  if (p.rewireWire) {
    for (const msg of ctx.messages) {
      if (typeof msg.content === "string" && msg.content) msg.content = p.rewireWire(msg.content);
    }
  }
  if (ctx.aborted()) return ctx.finalizeAborted(), "stop";
  return "go";
}

/**
 * Write-confirm: the user approves BEFORE anything mutating runs. The card shows the values
 * that will ACTUALLY be written — a BROWSE tool through `wireArg` (the client's own un-redactor,
 * the only one restoring an ENCODED fake), every other connector through `fromWireArgs`.
 * Raced against Stop, or a Stop while the dialog is open parks the loop forever.
 */
export async function confirmGate(ctx: LoopCtx, c: ConnectorCall, d: CallDecision): Promise<Step | "go"> {
  const { p } = ctx;
  const { call, args, bareTool, connectorId } = c;
  if (d.missing.length || d.navBlocked || d.navFake || d.draftOnly || d.consultOnly || d.alreadyDone) return "go";
  if (!p.confirmWrite || !d.needsConfirm) return "go";
  const phase = ctx.dbg({
    type: "phase", scope: "confirm",
    label: `Confirmation attendue (${confirmActLabel(d.confirmReason)}) · ${bareTool}`,
    detail: connectorId,
  });
  let approved: boolean;
  try {
    approved = await raceAbort(
      p.confirmWrite({
        tool: bareTool,
        server: connectorId,
        args: isWebBrowseTool(call.name) ? (deredactArgs(args, ctx.wireArg) as Record<string, unknown>) : d.deredactedArgs,
        attachments: d.attachmentNames.length ? d.attachmentNames : undefined,
        reason: d.confirmReason,
        flags: d.confirmFlags,
      }),
      p.signal,
    );
  } catch (e) {
    if (ctx.aborted() || isAbortError(e)) {
      updateDebug(phase, { label: `Confirmation interrompue · ${bareTool}`, ok: false });
      return ctx.finalizeAborted(), "stop";
    }
    throw e;
  }
  updateDebug(phase, { label: `${approved ? "Autorisé" : "Refusé"} (${confirmActLabel(d.confirmReason)}) · ${bareTool}`, ok: approved });
  if (ctx.aborted()) return ctx.finalizeAborted(), "stop";
  d.declinedByUser = !approved;
  return "go";
}
