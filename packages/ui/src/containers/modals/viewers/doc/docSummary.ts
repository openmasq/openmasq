import { kindLabelFr } from "../../../../components/message/kindLabel";

/**
 * What the preview's subtitle says about a document's redaction.
 *
 * The old line read « 10 à redact » — a FUTURE tense over a view that already shows the
 * result, on the one screen the user opens to check what will leave the machine. It also
 * gave a bare number with no way to see what the ten values WERE without hovering each
 * mark, which does not scale past a page.
 *
 * So: a present-tense count, plus a per-category breakdown for the tooltip. Both derive
 * from the same list, so they can't disagree.
 */
export interface DocSummary {
  /** « 10 valeurs protégées » / « aucune valeur détectée » — states what IS. */
  label: string;
  /** « 2 × Noms & prénoms · 2 × E-mail … », richest first. Empty when nothing matched. */
  detail: string;
}

/**
 * The subtitle's THREE first-class states (audit 2026-08-10). « aucune valeur
 * détectée » may only ever be a PROVEN claim: while the drop-time pass is still
 * running (a multi-page PDF takes seconds — exactly when the preview gets opened
 * from the progress chip), and worse after it FAILED, the header used to make that
 * exact claim — the reassuring lie, on the one screen whose job is to be trusted.
 * `replacements === undefined` with neither flag means the redaction was never
 * threaded here (display-only callers): say so, never « nothing found ».
 */
export interface PreviewStatus extends DocSummary {
  /** The drop-time pass FAILED — the views are showing the document unmasked. */
  failed?: boolean;
  /** The pass is still running (or was never run here) — no claim can be made yet. */
  pending?: boolean;
}

export function previewStatus(opts: {
  redacting?: boolean;
  redactProgress?: { done: number; total: number };
  redactError?: string;
  replacements: ReadonlyArray<{ real: string; kind?: string }> | undefined;
}): PreviewStatus {
  if (opts.redacting) {
    const p = opts.redactProgress;
    return {
      label: `redaction en cours…${p && p.total > 1 ? ` (${p.done}/${p.total})` : ""}`,
      detail: "",
      pending: true,
    };
  }
  if (opts.redactError) return { label: "échec du redaction", detail: opts.redactError, failed: true };
  if (opts.replacements === undefined)
    return { label: "redaction non vérifié ici", detail: "", pending: true };
  return docSummary(opts.replacements);
}

export function docSummary(
  replacements: ReadonlyArray<{ real: string; kind?: string }> | undefined,
): DocSummary {
  const byKind = new Map<string, number>();
  const seen = new Set<string>();
  for (const r of replacements ?? []) {
    if (!r.real || seen.has(r.real)) continue; // one count per distinct VALUE
    seen.add(r.real);
    const label = kindLabelFr(r.kind);
    byKind.set(label, (byKind.get(label) ?? 0) + 1);
  }
  const total = seen.size;
  const detail = [...byKind.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "fr"))
    .map(([label, n]) => `${n} × ${label}`)
    .join(" · ");
  return {
    label: total === 0 ? "aucune valeur détectée" : `${total} valeur${total > 1 ? "s" : ""} protégée${total > 1 ? "s" : ""}`,
    detail,
  };
}
