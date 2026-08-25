import { useMemo } from "react";
import { replacementDisplayTokens } from "@openmasq/redact";
import { useChatSelector } from "../../../providers/chatStore";
import type { PdfReplacement } from "@openmasq/redact/pdf-redact";

/**
 * The replacement list AS DISPLAYED under the jetons setting (`redactTokenDisplay`):
 * each `fake` is swapped for its `[PERSON1]`-style token, so every consumer of the SAME
 * list agrees — the redacted text, the DocText segments, the PDF/scan painted boxes, the
 * spreadsheet grid AND the selection→real mapping (`realFromRedactedSelection` keys on
 * `fake`, so a selected token maps back to its real value like a fake did).
 *
 * ⚠️ DISPLAY-ONLY — apply this at RENDER call sites, never on a list that flows back
 * out (the drop-time map reused by the send, a persisted file's replacements): the wire
 * must keep the true pseudonyms. `real`/`tone`/`kind` are untouched, so the reveal set,
 * the tone chips and the force-redaction paths (all keyed on `real`) are unchanged.
 */
export function withDisplayTokens(replacements: PdfReplacement[]): PdfReplacement[] {
  const tokens = replacementDisplayTokens(replacements);
  return replacements.map((r) => {
    const t = r.real ? tokens.get(r.real) : undefined;
    return t ? { ...r, fake: t } : r;
  });
}

/** {@link withDisplayTokens} gated on the setting — identity (same ref) when off. */
export function useDisplayReplacements(
  replacements: PdfReplacement[] | undefined,
): PdfReplacement[] | undefined {
  const tokenDisplay = useChatSelector((s) => !!s.settings?.redactTokenDisplay);
  return useMemo(
    () => (tokenDisplay && replacements ? withDisplayTokens(replacements) : replacements),
    [tokenDisplay, replacements],
  );
}
