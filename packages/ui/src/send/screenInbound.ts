import type { CompleteFn } from "@openmasq/redact";
import {
  isExternalProvenance,
  labelInbound,
  parseScreenVerdict,
  prescreen,
  provenanceForTool,
  screenPrompt,
  type ScreenVerdict,
} from "./inboundScreen";
import { pushDebug } from "../state/debug";
import { captureError } from "../analytics";

/** What the inbound-screening façade needs from the send. `isWebTool` is injected (the
 *  caller already knows `isWebBrowseTool`) so this module stays free of browser-policy
 *  imports. */
export interface ScreenInboundDeps {
  completeFn: CompleteFn | undefined;
  isWebTool: (tool: string) => boolean;
  convId?: string;
}

/**
 * Build the inbound screener applied to every REDACTED tool result: label the result with
 * its provenance, and escalate to the model classifier only for EXTERNAL content that the
 * free tier-1 pre-filter already flagged. Twenty page reads in one turn must not become
 * twenty classifier calls. (The primitives + why it LABELS and never blocks:
 * `inboundScreen.ts`; extracted from `toolResult.ts` as its impure façade.)
 *
 * Failure semantics: a classifier that throws or has no route yields `unscreened` — the
 * label then says the content was NOT verified rather than implying it was cleared. The
 * whole path is best-effort: a screening error must never lose a tool result.
 */
export function makeScreenInbound(deps: ScreenInboundDeps) {
  const { completeFn, isWebTool, convId } = deps;
  return async (redacted: string, tool?: string): Promise<string> => {
    try {
      const provenance = provenanceForTool(tool, !!tool && isWebTool(tool));
      if (!provenance || !redacted.trim()) return redacted;
      const tier1 = prescreen(redacted);
      if (!tier1.flagged || !isExternalProvenance(provenance)) {
        return labelInbound(provenance, redacted, { decision: "safe" });
      }
      if (!completeFn) {
        return labelInbound(provenance, redacted, {
          decision: "suspect",
          reason: tier1.reasons.join(", "),
          unscreened: true,
        });
      }
      let verdict: ScreenVerdict;
      try {
        const reply = await completeFn([{ role: "user", content: screenPrompt(provenance, redacted) }]);
        verdict = parseScreenVerdict(reply);
      } catch {
        // Unreachable classifier: tier 1 flagged it and nothing cleared it, so say so.
        verdict = { decision: "suspect", reason: tier1.reasons.join(", "), unscreened: true };
      }
      pushDebug(
        {
          type: "phase",
          scope: "system",
          label: "screening entrant",
          detail: `${provenance} · ${verdict.decision}${verdict.reason ? ` (${verdict.reason})` : ""}`,
          ok: verdict.decision === "safe",
        },
        convId,
      );
      return labelInbound(provenance, redacted, verdict);
    } catch (e) {
      // A SECURITY-LABELING path that breaks must never break silently: the result then
      // reaches the model WITHOUT a label (audit 13/08). The result is never lost
      // (contract unchanged) — but the failure is reported.
      captureError({
        scope: "screening",
        code: "inbound-screen",
        message: e instanceof Error ? e.message : String(e),
      });
      return redacted; // never lose a tool result to a screening bug
    }
  };
}
