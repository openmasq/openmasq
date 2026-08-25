import { SECTION_GUIDE, type SectionGuide } from "./sections";
import { BRAND } from "@openmasq/branding";

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

/** What a user is likely to TYPE for a section, beyond its label. Kept deliberately
 *  short: real alternatives (the English word, the thing it holds), not a thesaurus. */
const SYNONYMS: Record<SectionGuide["id"], string> = {
  chats: "chat conversation discussion message écrire nouvelle",
  library: "fichiers documents images pièces jointes pdf téléchargements library",
  competences:
    "prompts instructions modèles de message raccourcis skills routines workflows automatisation connecteurs outils",
  memory: "souvenirs fiches profil se souvenir retenir contexte",
  vault: "masquer toujours termes mots secrets noms de code vault coffre-fort",
};

export interface SectionDestination {
  /** A real section, or the pseudo-destination `"guide"` (opens « Aide »). */
  id: SectionGuide["id"] | "guide";
  title: string;
  sub: string;
}

const GUIDE_ENTRY: SectionDestination & { kw: string } = {
  id: "guide",
  title: `Aide — prendre en main ${BRAND.name}`,
  sub: `Le masquage, les mots de ${BRAND.name}, et à quoi sert chaque section.`,
  kw: "aide guide aidez-moi comment ça marche débuter démarrer tutoriel manuel documentation help",
};

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
  isOpen: (id: SectionGuide["id"]) => boolean = () => true,
): SectionDestination[] {
  const q = fold(query.trim());
  if (!q) return [];
  const out: SectionDestination[] = SECTION_GUIDE.filter(
    (s) => isOpen(s.id) && fold(`${s.label} ${s.tip} ${s.guide} ${SYNONYMS[s.id]}`).includes(q),
  ).map((s) => ({ id: s.id, title: s.label, sub: s.tip.replace(`${s.label} — `, "") }));
  if (fold(`${GUIDE_ENTRY.title} ${GUIDE_ENTRY.sub} ${GUIDE_ENTRY.kw}`).includes(q)) {
    out.push({ id: GUIDE_ENTRY.id, title: GUIDE_ENTRY.title, sub: GUIDE_ENTRY.sub });
  }
  return out;
}
