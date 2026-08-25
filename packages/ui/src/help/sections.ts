import type { Section } from "../types";
import { BRAND } from "@openmasq/branding";

/**
 * The user-facing VOCABULARY of the six content sections — label, rail tooltip, page
 * subtitle, guide paragraph — in ONE place.
 *
 * Why it exists: these four strings describe the same thing to the same person, and they
 * used to live in four different files. The nav said « Coffre » and the tooltip said
 * « Coffre » — the sentence that explains what a Coffre IS only existed on the page you
 * had to already be on. Single-sourcing them (rule 9) is also what keeps the in-app
 * guide TRUE: it renders these strings rather than a second description that can drift.
 *
 * `settings` is deliberately absent — a gear is self-evident and has its own per-tab
 * index (`pages/Settings/settingsIndex.ts`).
 */
export interface SectionGuide {
  id: Exclude<Section, "settings">;
  /** The nav label — must read identically in the rail, the sidebar and the guide. */
  label: string;
  /** Rail/sidebar tooltip: the label PLUS what it is for, in one breath. A tooltip that
   *  only repeats the label teaches nothing, and four of these six names are the app's
   *  own words. */
  tip: string;
  /** The section page's header subtitle (`PageHeader subtitle`) — absent for `chats`,
   *  which has no page header (the conversation IS the screen). Never invent one here:
   *  a string no page renders is a claim nobody can check. */
  subtitle?: string;
  /** The guide's paragraph: plain language, no product jargon, no file names. */
  guide: string;
}

/**
 * Le `tip` sans son préfixe d'étiquette : « Conversations — vos échanges avec les
 * modèles » donne « vos échanges avec les modèles ».
 *
 * Le premier lancement liste les six endroits avec leur NOM en regard : y remettre le nom
 * dans la phrase le dirait deux fois, et le paragraphe du guide (`guide`) y serait six
 * fois trop long. On DÉRIVE donc du `tip` — dont la forme « Étiquette — ce à quoi ça
 * sert » est une convention de ce fichier, épinglée par `sections.test.ts` — plutôt que
 * d'écrire une troisième version de la même phrase quelque part.
 */
export function sectionOneLiner(s: SectionGuide): string {
  const cut = s.tip.indexOf("—");
  return cut < 0 ? s.tip : s.tip.slice(cut + 1).trim();
}

export const SECTION_GUIDE: readonly SectionGuide[] = [
  {
    id: "chats",
    label: "Conversations",
    tip: "Conversations — vos échanges avec les modèles",
    guide:
      `C'est ici que vous écrivez. Tapez comme vous parlez : ${BRAND.name} masque les données sensibles avant l'envoi, et rétablit vos vraies valeurs dans la réponse. Le nom du modèle est sous la zone de saisie — cliquez-le pour en changer à tout moment.`,
  },
  {
    id: "library",
    label: "Bibliothèque",
    tip: "Bibliothèque — les fichiers de vos conversations, déjà masqués",
    subtitle: "Tous les fichiers et images de vos conversations, protégés et prêts à réutiliser.",
    guide:
      "Chaque image et document partagé dans une conversation atterrit ici automatiquement, déjà masqué. Vous les retrouvez par type, et vous les réutilisez ailleurs en un clic.",
  },
  {
    id: "competences",
    label: "Compétences",
    tip: "Compétences — vos instructions réutilisables",
    subtitle:
      "Vos instructions réutilisables, rangées par catégorie. Utilisez-en une en un clic, ou tapez / dans la zone de message.",
    guide:
      "Une bonne instruction que vous réécrivez souvent — une réponse type, une traduction, un résumé — s'enregistre une fois et se réutilise partout. Certaines mettent en plus vos services connectés au travail (« rassemble mes e-mails importants de la semaine et prépare un résumé ») : ce sont les Routines, une catégorie comme une autre. Tapez / dans la zone de message pour en utiliser une.",
  },
  {
    id: "memory",
    label: "Mémoire",
    tip: `Mémoire — ce que ${BRAND.name} retient d'une fois sur l'autre`,
    subtitle: `Ce que ${BRAND.name} retient d'une conversation à l'autre, pour ne pas avoir à vous répéter.`,
    guide:
      "Pour ne pas réexpliquer chaque fois qui est ce client ou où en est ce projet. Dites « retiens que… » dans une conversation, sélectionnez un passage et choisissez « Retenir », ou créez une fiche ici. Tout reste sur votre machine, et part masqué comme le reste.",
  },
  {
    id: "vault",
    label: "Coffre",
    tip: "Coffre — les mots à masquer dans tous vos échanges",
    subtitle:
      "Vos termes toujours masqués — noms de code, comptes, identifiants — remplacés avant chaque envoi, quel que soit le modèle.",
    guide:
      `Vos mots à vous : un nom de code, un numéro de compte, un identifiant. Ajoutez-les une fois, et ${BRAND.name} les masque dans tous vos envois, sans exception.`,
  },
] as const;

const BY_ID = new Map(SECTION_GUIDE.map((s) => [s.id, s]));

/** The entry for a section, or `undefined` for `settings` (which has none by design). */
export function sectionGuide(id: Section): SectionGuide | undefined {
  return BY_ID.get(id as SectionGuide["id"]);
}

/** The page-header subtitle for a section that HAS a page header. Every caller is such a
 *  page, and `sections.test.ts` pins that each one still has its sentence — so the empty
 *  fallback is unreachable, not a silent blank. */
export function sectionSubtitle(id: SectionGuide["id"]): string {
  return BY_ID.get(id)?.subtitle ?? "";
}
