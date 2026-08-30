/**
 * Le vocabulaire des sections de contenu, assemblé par `ui/src/help/sections.ts`.
 *
 * Une TRANCHE du contrat (`../messages.ts`), qui reste la seule liste des namespaces.
 * Le découpage tient le cap 300 LOC (règle 1) — même forme que `packages/emails/i18n/`.
 */

/**
 * Le VOCABULAIRE des sections de contenu — étiquette, infobulle du rail, sous-titre de
 * page, paragraphe du guide, et les mots qu'on TAPE pour les trouver au ⌘K. Cinq
 * chaînes qui décrivent la même chose à la même personne : elles vivent ensemble
 * (règle 9), et `ui/src/help/sections.ts` les assemble.
 *
 * ⚠️ `tip` suit la forme « Étiquette — ce à quoi ça sert » DANS CHAQUE LANGUE. Le
 * premier lancement en dérive sa phrase courte en coupant au tiret CADRATIN
 * (`sectionOneLiner`), et `sections.test.ts` l'épingle : un tiret simple, ou un `tip`
 * qui ne commence pas par son étiquette, casse le test — pas l'affichage, ce qui serait
 * pire.
 *
 * ⚠️ `keywords` n'est pas de la prose : c'est une liste de mots séparés par des espaces,
 * repliée sans accents avant comparaison. On y met les vraies alternatives (le mot de
 * l'autre langue, la chose que ça contient), jamais un thésaurus.
 */
export interface SectionsMessages {
  chats: { label: string; tip: string; guide: (brand: string) => string; keywords: string };
  library: { label: string; tip: string; subtitle: string; guide: string; keywords: string };
  competences: { label: string; tip: string; subtitle: string; guide: string; keywords: string };
  memory: {
    label: string;
    tip: (brand: string) => string;
    subtitle: (brand: string) => string;
    guide: string;
    keywords: string;
  };
  vault: {
    label: string;
    tip: string;
    subtitle: string;
    guide: (brand: string) => string;
    keywords: string;
  };
  /** La pseudo-destination « Aide » du ⌘K — pas une section, mais elle se cherche dans
   *  la même liste et doit donc se traduire avec elle. */
  helpEntry: { title: (brand: string) => string; sub: (brand: string) => string; keywords: string };
}
