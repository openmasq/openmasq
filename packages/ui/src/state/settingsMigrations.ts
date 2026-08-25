import type { Settings } from "../types";

/**
 * Migrations de RÉGLAGES — les recalages ponctuels qu'un blob persisté doit subir quand le
 * produit change une valeur par défaut sous ses pieds.
 *
 * Elles vivent à part de `storePersistence.ts` parce qu'elles ne se ressemblent pas : chacune
 * est datée, porte son propre « avant », et n'a de sens qu'une fois. Les mélanger à la
 * normalisation permanente rendait les deux illisibles.
 */

/**
 * Le jeu de catégories qu'une installation SEEDAIT avant que « Chaînes type clé »
 * (`apikey`) rejoigne le plancher commun à tous les niveaux.
 *
 * Il est ici pour une raison précise : les réglages sont persistés EN ENTIER depuis
 * `DEFAULT_SETTINGS`, donc chaque utilisateur porte un `apikey: false` explicite. Sans
 * cette migration, tous se réveilleraient en « Sur mesure » — ni Standard, ni Renforcé,
 * ni Strict — pour un réglage qu'ils n'ont jamais touché. Exactement le renommage
 * silencieux que `levelOf` s'interdit par ailleurs.
 *
 * La correspondance est EXACTE, et c'est ce qui la rend sûre : seul un jeu identique au
 * défaut de cette époque est déplacé. Quelqu'un qui avait réglé une seule case reste sur
 * mesure — on ne devine jamais qu'un `apikey: false` était subi plutôt que voulu.
 */
const PRE_APIKEY_FLOOR_DEFAULTS: Record<string, boolean> = {
  name: true, dob: true, username: false, email: true, phone: true, address: true,
  location: true, company: true, card: true, iban: true, national_id: true,
  company_id: true, ip: true, path: true, url: false, secret: true, apikey: false,
};

/** Le jeu ci-dessus, à l'identique — au `apikey` près, désormais dans le plancher. */
function isPreApikeyFloorDefault(cats: Record<string, boolean> | undefined): boolean {
  if (!cats) return false;
  const keys = Object.keys(PRE_APIKEY_FLOOR_DEFAULTS);
  if (Object.keys(cats).length !== keys.length) return false;
  return keys.every((k) => cats[k] === PRE_APIKEY_FLOOR_DEFAULTS[k]);
}


/** Applique les migrations à la carte de catégories. `defaults` est le seed courant. */
export function migrateRedactCategories(
  saved: Settings["redactCategories"] | undefined,
  defaults: Settings["redactCategories"],
): Settings["redactCategories"] {
  if (isPreApikeyFloorDefault(saved as Record<string, boolean> | undefined)) {
    return { ...defaults };
  }
  return { ...defaults, ...(saved ?? {}) } as Settings["redactCategories"];
}
