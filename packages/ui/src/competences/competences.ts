import type { Messages } from "@openmasq/i18n";
import type { Competence, CompetenceCategoryId } from "../types";

/**
 * Pure logic for the COMPÉTENCES — reusable prompts the user uses in a chat.
 * React-free and unit-tested, so the view stays presentation only (root rule:
 * behaviour in `.ts`, chrome in `.tsx`). Mirrors `send/coffre.ts`, the other
 * user-authored list.
 *
 * Ce fichier ne sait que RANGER une liste (créer, filtrer, épingler, restaurer). Ce
 * qu'une compétence FAIT quand on s'en sert — le texte ajouté au payload, la portée
 * d'outils qu'ouvre `servers` — est `./launch.ts`.
 *
 * This is NOT in `send/` on purpose: a compétence never reaches the wire as a
 * rule — its prompt rides the model payload, through the ordinary redaction
 * pipeline like any typed text.
 */

/** The category vocabulary. `id` persists; tone/glyph are presentation, and the LABEL
 *  comes from the reader's catalogue (`lists.competenceCategories`) — pass a `t`.
 *  `tone` keys the `--hl-*` highlight tokens. */
// ⚠️ Glyphs must exist in `--font-display` (Space Grotesk). The kit uses "✍" for
// Rédaction, but that's a dingbat the font lacks — it rendered as a BLANK tile in the
// app (verified in a build). Stick to Latin-1/geometric marks, which all render.
export const COMPETENCE_CATEGORIES: {
  id: CompetenceCategoryId;
  tone: string;
  glyph: string;
}[] = [
  { id: "redaction", tone: "sky", glyph: "¶" },
  { id: "analyse", tone: "violet", glyph: "◑" },
  { id: "code", tone: "lime", glyph: "{}" },
  { id: "juridique", tone: "amber", glyph: "§" },
  { id: "support", tone: "pink", glyph: "◈" },
  // La destination des anciens « workflows », et la catégorie que la modale propose
  // d'elle-même dès qu'on choisit des connecteurs. Le mot que les gens avaient n'est pas
  // perdu : il est descendu d'une SECTION à une catégorie, ce qui est sa vraie taille.
  { id: "routine", tone: "mint", glyph: "»" },
];

const FALLBACK = COMPETENCE_CATEGORIES[0];

/** The category record for an id, never undefined — an unknown id (an older or
 *  hand-edited entry) degrades to the first category rather than crashing a render. */
export type CompetenceCategory = (typeof COMPETENCE_CATEGORIES)[number] & { label: string };

/** La liste ENTIÈRE, libellée dans la langue de `t` — l'ordre reste celui du dessin. */
export function competenceCategories(t: Messages): CompetenceCategory[] {
  return COMPETENCE_CATEGORIES.map((c) => ({ ...c, label: t.lists.competenceCategories[c.id] }));
}

export function competenceCategory(id: string, t: Messages): CompetenceCategory {
  const cat = COMPETENCE_CATEGORIES.find((c) => c.id === id) ?? FALLBACK;
  return { ...cat, label: t.lists.competenceCategories[cat.id] };
}

/** A stable id. `crypto.randomUUID` where available, else a time+random fallback
 *  (same shape as `makeCoffreTerm`'s — some webviews lack randomUUID). */
function newId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `cp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Build a Compétence from user input. Trims, defaults the category, dedupes the
 *  connector ids, stamps id + createdAt. Returns null when there is nothing to save —
 *  a compétence with no name AND no prompt is not a thing. */
export function makeCompetence(input: {
  name: string;
  prompt: string;
  desc?: string;
  cat?: string;
  servers?: string[];
}): Competence | null {
  const name = input.name.trim();
  const prompt = input.prompt.trim();
  if (!name || !prompt) return null;
  const cat = COMPETENCE_CATEGORIES.some((c) => c.id === input.cat)
    ? (input.cat as CompetenceCategoryId)
    : FALLBACK.id;
  const servers = [...new Set(input.servers ?? [])];
  return {
    id: newId(),
    name,
    prompt,
    desc: input.desc?.trim() || undefined,
    cat,
    // Absent plutôt que `[]` : le champ est facultatif, et une liste vide écrite partout
    // ferait croire à une compétence à outils dans tout ce qui teste sa présence.
    ...(servers.length ? { servers } : {}),
    pinned: false,
    uses: 0,
    createdAt: Date.now(),
  };
}

/** Reinsert a deleted compétence VERBATIM at the head — the "Annuler" of a delete.
 *  Same id, so chips/deep-links to it keep resolving (a plain add would mint a new
 *  one). Idempotent by REFERENCE: when the id is already present the SAME array
 *  comes back, so a double-fired undo is a no-op state write, not a duplicate. */
export function restoreCompetenceList(
  list: readonly Competence[],
  c: Competence,
): readonly Competence[] {
  if (list.some((x) => x.id === c.id)) return list;
  return [c, ...list];
}

/** Filter by category + a free-text query over name/desc/prompt (case-insensitive).
 *  `cat: "all"` keeps every category; `cat: "tools"` garde celles qui pilotent des
 *  connecteurs — l'ancienne liste « workflows » est devenue ce filtre, pas un écran.
 *  Pure — the view just renders the result. */
export function filterCompetences(
  list: readonly Competence[],
  cat: string,
  query: string,
): Competence[] {
  const q = query.trim().toLowerCase();
  return list.filter((c) => {
    if (cat !== "all" && c.cat !== cat) return false;
    if (!q) return true;
    // Le prompt est cherché aussi : c'est ce que faisait la recherche des workflows, et
    // on retrouve une routine par ce qu'elle DIT plus souvent que par son nom.
    return (
      c.name.toLowerCase().includes(q) ||
      (c.desc ?? "").toLowerCase().includes(q) ||
      c.prompt.toLowerCase().includes(q)
    );
  });
}

/** Per-category counts for the filter chips, plus `all`. Counts the WHOLE list
 *  (not the filtered one) so a chip's count doesn't change as you type. */
export function competenceCounts(list: readonly Competence[]): Record<string, number> {
  const counts: Record<string, number> = { all: list.length };
  for (const c of list) counts[c.cat] = (counts[c.cat] ?? 0) + 1;
  return counts;
}

/** The pinned ones, for the sidebar's one-click list. Most-used first, then
 *  newest — a pinned compétence you actually use should not sink. */
export function pinnedCompetences(list: readonly Competence[]): Competence[] {
  return list
    .filter((c) => c.pinned)
    .sort((a, b) => (b.uses ?? 0) - (a.uses ?? 0) || b.createdAt - a.createdAt);
}
