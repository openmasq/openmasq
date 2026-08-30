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

/* Les SYNONYMES — ce qu'un utilisateur tape en plus de l'étiquette — vivent avec le reste
   du vocabulaire de section (`sections.keywords` du catalogue), et non dans une seconde
   table ici : la liste anglaise et la liste française ne sont pas la traduction l'une de
   l'autre (un francophone tape « coffre-fort », un anglophone « vault »), donc elles se
   rédigent là où chaque langue s'écrit. */

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

/** Fold accents + lowercase, so « memoire » trouve « Mémoire ». Same rule as the
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
 * `isOpen` filtre les sections dont la PORTE est fermée (`state/featureAccess.ts`) :
 * un résultat ⌘K vers un écran non monté serait un cul-de-sac. Il est INJECTÉ pour que
 * ce dossier reste le vocabulaire, sans rien savoir de l'état de l'app — et pour que
 * son test n'ait pas d'état global à remettre à zéro. Absent ⇒ tout est ouvert.
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
