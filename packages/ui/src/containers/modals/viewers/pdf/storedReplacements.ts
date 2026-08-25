import { hueForTone } from "@openmasq/redact";
import type { PdfReplacement } from "@openmasq/redact/pdf-redact";

/**
 * La carte de redaction STOCKÉE avec le fichier (l'extraction persistée) → les
 * `PdfReplacement[]` que les viewers peignent.
 *
 * C'est la carte du DÉPÔT, figée au moment où le document est parti — la source qui rend
 * la Bibliothèque identique à la modale post-dépôt (mêmes éléments, mêmes teintes). Le
 * repli historique — reconstruire depuis le coffre de la CONVERSATION — sur-marquait :
 * le coffre accumule les valeurs de toute la conversation, et ses `kinds` viennent d'un
 * autre producteur, donc d'autres teintes. Il reste le repli des fichiers d'avant la
 * persistance de la carte.
 *
 * DÉFENSIF de bout en bout : le blob vient d'un JSON en base (une vieille ligne, une
 * autre version) — une entrée sans `real`/`fake` chaîne saute, et la teinte passe par
 * `hueForTone`, qui rend une teinte VALIDE pour n'importe quelle chaîne (une teinte
 * libre finirait en nom de classe CSS). Tri longueur décroissante, comme
 * `vaultReplacements` : une valeur ne doit pas être rognée par sa sous-chaîne.
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

/** Le `original→catégorie` de la carte stockée — pour l'entête « N masqués » de la
 *  modale, qui sinon nommait les catégories de TOUTE la conversation. */
export function storedKinds(reps: PdfReplacement[] | undefined): Record<string, string> | undefined {
  if (!reps?.length) return undefined;
  const out: Record<string, string> = {};
  for (const r of reps) if (r.kind) out[r.real] = r.kind;
  return Object.keys(out).length ? out : undefined;
}
