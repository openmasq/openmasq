import type { Messages } from "@openmasq/i18n";
import type { CSSProperties } from "react";
import { MEMORY_CATEGORIES, memoryCategory, memoryCategoryLabel } from "../../../memory";
import type { MemoryCard } from "../../../types";

/**
 * A category dot's fill. The tone is DATA (the store's category table), so it resolves to
 * a `--hl-*` token at render — the same mapping the desktop graph paints with, rather
 * than a CSS enumeration a new category would silently fall out of.
 */
export function toneStyle(tone: string): CSSProperties {
  return { background: `var(--hl-${tone})` };
}

export interface MemoryGroup {
  id: string;
  label: string;
  /** The `--hl-*` tone name the dot paints with. */
  tone: string;
  cards: MemoryCard[];
}

/**
 * The mobile Mémoire's grouped list (kit `chat-app-mobile` MemoryScreen). The desktop
 * draws a force-directed GRAPH — the right shape for a mouse and a wide canvas, the wrong
 * one for a thumb — so a phone gets the same cards as category groups of tappable chips.
 * Nothing is filtered out: the categories are the store's own (`MEMORY_CATEGORIES`), and a
 * card whose `cat` is unknown or missing falls into "Autre" via `memoryCategory`, so no
 * card can be remembered yet invisible. Empty groups are dropped — a heading with no
 * chips is noise on a small screen, and the add affordance lives at the screen level.
 */
export function groupMemoryCards(cards: MemoryCard[], t: Messages): MemoryGroup[] {
  const byId = new Map<string, MemoryCard[]>();
  for (const card of cards) {
    const cat = memoryCategory(card.cat).id;
    const list = byId.get(cat);
    if (list) list.push(card);
    else byId.set(cat, [card]);
  }
  return MEMORY_CATEGORIES.filter((c) => byId.has(c.id)).map((c) => ({
    id: c.id,
    label: memoryCategoryLabel(c.id, t),
    tone: c.tone,
    cards: byId.get(c.id) ?? [],
  }));
}
