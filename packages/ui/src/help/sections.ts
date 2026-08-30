import type { Messages } from "@openmasq/i18n";
import { BRAND } from "@openmasq/branding";
import type { Section } from "../types";

/**
 * The user-facing VOCABULARY of the content sections — label, rail tooltip, page
 * subtitle, guide paragraph, ⌘K keywords — assembled from the ONE catalogue
 * (`@openmasq/i18n`, namespace `sections`).
 *
 * Why it exists: these strings describe the same thing to the same person, and they used
 * to live in as many files. The nav said « Coffre » and the tooltip said « Coffre » — the
 * sentence that explains what a Coffre IS only existed on the page you had to already be
 * on. Single-sourcing them (rule 9) is also what keeps the in-app guide TRUE: it renders
 * these strings rather than a second description that can drift.
 *
 * ## Ce fichier ASSEMBLE, il ne rédige pas
 *
 * La copie vit dans le catalogue, en français ET en anglais ; ici on la résout (le nom de
 * marque est injecté, pas écrit dans les catalogues) et on la présente sous la forme que
 * les écrans consomment. D'où le `t: Messages` que chaque fonction réclame : ce module
 * reste PUR — pas de React, pas de contexte — donc utilisable par un test comme par un
 * composant, qui lui passe son `useT()`.
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
  /** Ce qu'on TAPE au ⌘K en plus de l'étiquette — des mots, pas une phrase. */
  keywords: string;
}

/**
 * Le `tip` sans son préfixe d'étiquette : « Conversations — vos échanges avec les
 * modèles » donne « vos échanges avec les modèles ».
 *
 * Le premier lancement liste les endroits avec leur NOM en regard : y remettre le nom
 * dans la phrase le dirait deux fois, et le paragraphe du guide (`guide`) y serait six
 * fois trop long. On DÉRIVE donc du `tip` — dont la forme « Étiquette — ce à quoi ça
 * sert » est une convention du catalogue, épinglée par `sections.test.ts` dans CHAQUE
 * langue — plutôt que d'écrire une troisième version de la même phrase quelque part.
 */
export function sectionOneLiner(s: SectionGuide): string {
  const cut = s.tip.indexOf("—");
  return cut < 0 ? s.tip : s.tip.slice(cut + 1).trim();
}

/** Le vocabulaire des sections dans la langue de `t`, en ordre de navigation. */
export function sectionGuides(t: Messages): readonly SectionGuide[] {
  const s = t.sections;
  return [
    { id: "chats", ...s.chats, guide: s.chats.guide(BRAND.name) },
    { id: "library", ...s.library },
    { id: "competences", ...s.competences },
    {
      id: "memory",
      ...s.memory,
      tip: s.memory.tip(BRAND.name),
      subtitle: s.memory.subtitle(BRAND.name),
    },
    { id: "vault", ...s.vault, guide: s.vault.guide(BRAND.name) },
  ] as const;
}

/** The entry for a section, or `undefined` for `settings` (which has none by design). */
export function sectionGuide(id: Section, t: Messages): SectionGuide | undefined {
  return sectionGuides(t).find((s) => s.id === (id as SectionGuide["id"]));
}

/** The page-header subtitle for a section that HAS a page header. Every caller is such a
 *  page, and `sections.test.ts` pins that each one still has its sentence — so the empty
 *  fallback is unreachable, not a silent blank. */
export function sectionSubtitle(id: SectionGuide["id"], t: Messages): string {
  return sectionGuide(id, t)?.subtitle ?? "";
}
