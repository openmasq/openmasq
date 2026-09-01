import type { Messages } from "@openmasq/i18n";
import type { Skill, SkillCategoryId } from "../types";

/**
 * Pure logic for the COMPÉTENCES — reusable prompts the user uses in a chat.
 * React-free and unit-tested, so the view stays presentation only (root rule:
 * behaviour in `.ts`, chrome in `.tsx`). Mirrors `send/coffre.ts`, the other
 * user-authored list.
 *
 * This file only knows how to STORE a list (create, filter, pin, restore). What
 * a compétence DOES when used — the text added to the payload, the tool
 * scope `servers` opens — is `./launch.ts`.
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
export const SKILL_CATEGORIES: {
  id: SkillCategoryId;
  tone: string;
  glyph: string;
}[] = [
  { id: "redaction", tone: "sky", glyph: "¶" },
  { id: "analyse", tone: "violet", glyph: "◑" },
  { id: "code", tone: "lime", glyph: "{}" },
  { id: "juridique", tone: "amber", glyph: "§" },
  { id: "support", tone: "pink", glyph: "◈" },
  // The destination of the old "workflows", and the category the modal offers
  // on its own as soon as connectors are chosen. The word people had is not
  // lost: it went down from a SECTION to a category, which is its true size.
  { id: "routine", tone: "mint", glyph: "»" },
];

const FALLBACK = SKILL_CATEGORIES[0];

/** The category record for an id, never undefined — an unknown id (an older or
 *  hand-edited entry) degrades to the first category rather than crashing a render. */
export type SkillCategory = (typeof SKILL_CATEGORIES)[number] & { label: string };

/** The WHOLE list, labeled in `t`'s language — the order stays the design's order. */
export function skillCategories(t: Messages): SkillCategory[] {
  return SKILL_CATEGORIES.map((c) => ({ ...c, label: t.lists.skillCategories[c.id] }));
}

export function skillCategory(id: string, t: Messages): SkillCategory {
  const cat = SKILL_CATEGORIES.find((c) => c.id === id) ?? FALLBACK;
  return { ...cat, label: t.lists.skillCategories[cat.id] };
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
export function makeSkill(input: {
  name: string;
  prompt: string;
  desc?: string;
  cat?: string;
  servers?: string[];
}): Skill | null {
  const name = input.name.trim();
  const prompt = input.prompt.trim();
  if (!name || !prompt) return null;
  const cat = SKILL_CATEGORIES.some((c) => c.id === input.cat)
    ? (input.cat as SkillCategoryId)
    : FALLBACK.id;
  const servers = [...new Set(input.servers ?? [])];
  return {
    id: newId(),
    name,
    prompt,
    desc: input.desc?.trim() || undefined,
    cat,
    // Absent rather than `[]`: the field is optional, and an empty list written everywhere
    // would make everything testing its presence believe it's a tool-driving compétence.
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
export function restoreSkillList(
  list: readonly Skill[],
  c: Skill,
): readonly Skill[] {
  if (list.some((x) => x.id === c.id)) return list;
  return [c, ...list];
}

/** Filter by category + a free-text query over name/desc/prompt (case-insensitive).
 *  `cat: "all"` keeps every category; `cat: "tools"` keeps the ones that drive
 *  connectors — the old "workflows" list became this filter, not a screen.
 *  Pure — the view just renders the result. */
export function filterSkills(
  list: readonly Skill[],
  cat: string,
  query: string,
): Skill[] {
  const q = query.trim().toLowerCase();
  return list.filter((c) => {
    if (cat !== "all" && c.cat !== cat) return false;
    if (!q) return true;
    // The prompt is searched too: that is what the workflows search used to do, and
    // a routine gets found by what it SAYS more often than by its name.
    return (
      c.name.toLowerCase().includes(q) ||
      (c.desc ?? "").toLowerCase().includes(q) ||
      c.prompt.toLowerCase().includes(q)
    );
  });
}

/** Per-category counts for the filter chips, plus `all`. Counts the WHOLE list
 *  (not the filtered one) so a chip's count doesn't change as you type. */
export function skillCounts(list: readonly Skill[]): Record<string, number> {
  const counts: Record<string, number> = { all: list.length };
  for (const c of list) counts[c.cat] = (counts[c.cat] ?? 0) + 1;
  return counts;
}

/** The pinned ones, for the sidebar's one-click list. Most-used first, then
 *  newest — a pinned compétence you actually use should not sink. */
export function pinnedSkills(list: readonly Skill[]): Skill[] {
  return list
    .filter((c) => c.pinned)
    .sort((a, b) => (b.uses ?? 0) - (a.uses ?? 0) || b.createdAt - a.createdAt);
}
