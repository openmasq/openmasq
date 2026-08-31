import type { Messages } from "@openmasq/i18n";
import { BRAND } from "@openmasq/branding";
import { sectionGuides, type SectionGuide } from "./sections";

/**
 * ⌘K → the SECTIONS (and the guide itself).
 *
 * The palette used to search conversations, files and settings tabs only — so the six
 * places a newcomer is actually hunting for were the one thing it could not reach:
 * typing « coffre » or « mémoire » returned nothing. ⌘K is the "I don't know where
 * things are" tool, and it was failing precisely on the app's own words.
 *
 * Titles and subtitles come from the ONE vocabulary (`sections.ts`), so a result can
 * never describe a section differently from the nav that leads to it.
 */

/* The SYNONYMS — what a user types besides the label — live with the rest
   of the section vocabulary (the catalogue's `sections.keywords`), not in a second
   table here: the English list and the French list are not each other's
   translation (a French speaker types « coffre-fort », an English speaker « vault »), so they
   are authored where each language is written. */

export interface SectionDestination {
  /** A real section, or the pseudo-destination `"guide"` (opens « Aide »). */
  id: SectionGuide["id"] | "guide";
  title: string;
  sub: string;
}

const guideEntry = (t: Messages): SectionDestination & { kw: string } => ({
  id: "guide",
  title: t.sections.helpEntry.title(BRAND.name),
  sub: t.sections.helpEntry.sub(BRAND.name),
  kw: t.sections.helpEntry.keywords,
});

/** Fold accents + lowercase, so « memoire » finds « Mémoire ». Same rule as the
 *  settings search — a user types without accents far more often than with. */
const fold = (s: string): string =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/**
 * Sections matching a query, in nav order, with the guide last. An EMPTY query returns
 * nothing — the palette stays conversation-first, and listing all seven rows under an
 * empty box would bury the recent chats.
 *
 * `isOpen` filters out sections whose GATE is closed (`state/featureAccess.ts`):
 * a ⌘K result pointing to a screen that isn't mounted would be a dead end. It is INJECTED so
 * this folder stays the vocabulary, knowing nothing about the app's state — and so
 * its test has no global state to reset. Absent ⇒ everything is open.
 */
export function searchSections(
  query: string,
  t: Messages,
  isOpen: (id: SectionGuide["id"]) => boolean = () => true,
): SectionDestination[] {
  const q = fold(query.trim());
  if (!q) return [];
  const out: SectionDestination[] = sectionGuides(t)
    .filter((s) => isOpen(s.id) && fold(`${s.label} ${s.tip} ${s.guide} ${s.keywords}`).includes(q))
    .map((s) => ({ id: s.id, title: s.label, sub: s.tip.replace(`${s.label} — `, "") }));
  const guide = guideEntry(t);
  if (fold(`${guide.title} ${guide.sub} ${guide.kw}`).includes(q)) {
    out.push({ id: guide.id, title: guide.title, sub: guide.sub });
  }
  return out;
}
