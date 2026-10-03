// Deriving the real→fake map DETERMINISTICALLY from an existing conversation vault
// (`vaultReplacements`). A live detector run is `chunkMask.ts` (`pdfReplacements`); the
// correlation/paint halves are `pdfMatch.ts` / `pdfRedact.ts`, and the
// `@openmasq/redact/pdf-redact` subpath re-exports them all.
import { toneForKind } from "../highlight/segments";
import { chipKind } from "./chunkMask";
import type { PdfReplacement } from "./pdfMatch";

/**
 * Build the real→fake map DETERMINISTICALLY from an existing conversation vault
 * (`fake → original`) instead of re-running the model. Use this to render the
 * redacted preview of an ALREADY-SENT document: the vault already holds every
 * value that was redacted (and its exact fake), so the preview matches the wire
 * EXACTLY, needs no inference (instant, can't "fail" to 2 items), and injects no
 * fresh/inconsistent fakes. `kinds` (original → category) drives the tone; absent
 * ⇒ a default tone. Values that don't occur in the document are simply not found
 * by `renderRedactedPdf` and paint nothing.
 */
export function vaultReplacements(
  vault: Record<string, string>,
  kinds?: Record<string, string>,
): PdfReplacement[] {
  const out: PdfReplacement[] = [];
  const seen = new Set<string>();
  for (const [fake, real] of Object.entries(vault)) {
    if (!real || seen.has(real)) continue;
    seen.add(real);
    const raw = kinds?.[real];
    out.push({ real, fake, tone: toneForKind(raw ?? ""), kind: chipKind(raw) });
  }
  // Longest first so a value isn't clipped by a shorter substring of it.
  out.sort((a, b) => b.real.length - a.real.length);
  return out;
}
