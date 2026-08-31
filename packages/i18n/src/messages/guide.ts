/**
 * LE GUIDE en app — l'application qui s'explique elle-même.
 *
 * ⚠️ Règle 8, à son maximum : chaque affirmation ici est une PROMESSE sur l'endroit où
 * vont les données de quelqu'un. Une phrase qui sur-vend la protection est un bug de
 * confiance, pas une coquille — et une traduction qui l'adoucit ou la durcit en est un
 * aussi. Celles qui pourraient devenir fausses en silence sont épinglées par
 * `ui/src/help/guide.test.ts` contre les vrais défauts, dans CHAQUE langue.
 *
 * ⚠️ Écrit sous les règles de la documentation publique : langue courante, pour
 * l'utilisateur final. Aucun chemin de fichier, aucun nom de paquet, aucune architecture
 * interne, aucun sigle que l'interface ne développe jamais.
 *
 * Les chapitres de SECTION ne sont pas ici : ils se rendent depuis `sections` (une seule
 * maison), donc le guide ne peut pas s'écarter de la nav et des pages.
 *
 * Une TRANCHE du contrat (`../messages.ts`), qui reste la seule liste des namespaces.
 */
export interface GuideChapterCopy {
  title: (brand: string) => string;
  /** Le paragraphe d'ouverture — ce que c'est, en deux ou trois phrases. */
  lead: (brand: string) => string;
  /** Des points pratiques, courts. */
  points?: readonly ((brand: string) => string)[];
  /** Terme → définition, pour le chapitre lexique. */
  terms?: readonly { term: (brand: string) => string; def: (brand: string) => string }[];
}

export interface GuideMessages {
  protection: GuideChapterCopy;
  firstMessage: GuideChapterCopy;
  models: GuideChapterCopy;
  sections: GuideChapterCopy;
  words: GuideChapterCopy;
  data: GuideChapterCopy;
  releases: GuideChapterCopy;
}
