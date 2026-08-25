import { replaceStandalone } from "@openmasq/redact";
import type { PdfReplacement } from "../pdf/pdfReplacements";

/**
 * Map a text selection made on the REDACTED document view back to the REAL value.
 *
 * The redacted view shows FAKES for every already-redacted value. A manual
 * "Redact" over that view MUST force-redact the REAL value, never the fake —
 * forcing the fake would leave the real value in clear (a leak) and redact a
 * meaningless placeholder. So we reverse every fake→real in the selection
 * (longest fake first, word-boundary-safe — the inverse of the real→fake paint).
 *
 * A selection over a detector MISS (a value shown in clear because nothing caught
 * it — the common manual-redaction case) contains no fake, so it passes through
 * unchanged = the real value. Pure.
 */
export function realFromRedactedSelection(text: string, replacements?: PdfReplacement[]): string {
  if (!replacements?.length) return text;
  let t = text;
  for (const r of [...replacements].sort((a, b) => b.fake.length - a.fake.length)) {
    if (r.fake && r.real) t = replaceStandalone(t, r.fake, r.real);
  }
  return t;
}
