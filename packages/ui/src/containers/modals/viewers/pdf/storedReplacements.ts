import { hueForTone } from "@openmasq/redact";
import type { PdfReplacement } from "@openmasq/redact/pdf-redact";

/**
 * The redaction map STORED with the file (the persisted extraction) → the
 * `PdfReplacement[]` that the viewers paint.
 *
 * This is the DEPOSIT's map, frozen at the moment the document left — the source that keeps
 * the Bibliothèque identical to the post-deposit modal (same elements, same tones). The
 * historical fallback — rebuilding from the CONVERSATION vault — over-marked:
 * the vault accumulates values from the whole conversation, and its `kinds` come from
 * a different producer, so different tones. It remains the fallback for files from before
 * the map's persistence.
 *
 * DEFENSIVE end to end: the blob comes from JSON in the database (an old row, a
 * different version) — an entry without a string `real`/`fake` is skipped, and the tone goes through
 * `hueForTone`, which returns a VALID tone for any string (a free-form
 * tone would end up as a CSS class name). Sorted by decreasing length, like
 * `vaultReplacements`: a value must not be truncated by its substring.
 */
export function storedReplacements(raw: unknown): PdfReplacement[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: PdfReplacement[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    const e = r as { real?: unknown; fake?: unknown; tone?: unknown; kind?: unknown };
    if (typeof e?.real !== "string" || !e.real || typeof e.fake !== "string") continue;
    if (seen.has(e.real)) continue;
    seen.add(e.real);
    out.push({
      real: e.real,
      fake: e.fake,
      tone: hueForTone(typeof e.tone === "string" ? e.tone : ""),
      kind: typeof e.kind === "string" && e.kind ? e.kind : undefined,
    });
  }
  if (!out.length) return undefined;
  out.sort((a, b) => b.real.length - a.real.length);
  return out;
}

/** The `original→category` of the stored map — for the modal's « N masqués » header,
 *  which otherwise named the categories of the WHOLE conversation. */
export function storedKinds(reps: PdfReplacement[] | undefined): Record<string, string> | undefined {
  if (!reps?.length) return undefined;
  const out: Record<string, string> = {};
  for (const r of reps) if (r.kind) out[r.real] = r.kind;
  return Object.keys(out).length ? out : undefined;
}
