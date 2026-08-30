/**
 * Le REDACTION tel qu'on le montre : niveaux, types de donnée, carte de recherche web.
 *
 * Une TRANCHE du contrat (`../messages.ts`), qui reste la seule liste des namespaces.
 * Le découpage tient le cap 300 LOC (règle 1) — même forme que `packages/emails/i18n/`.
 */

/**
 * LE CONTRAT de traduction — l'interface que CHAQUE langue implémente.
 *
 * C'est le cœur du choix « catalogue typé, aucune bibliothèque » (cf. `CLAUDE.md`) : une
 * clé manquante ou en trop dans `fr.ts`/`en.ts` est une erreur `tsc`, pas un repli
 * silencieux à l'exécution. Aucun parseur ICU, aucun chargeur runtime dans un produit
 * dont la posture est « rien de non vérifié ne s'exécute » — l'interpolation et les
 * pluriels sont des FONCTIONS TypeScript typées, et les nombres/dates/monnaies passent
 * par `Intl` (présent dans Electron et tout navigateur).
 *
 * ## Comment ajouter une clé
 *
 * 1. l'ajouter ICI (dans le bon namespace) ;
 * 2. `tsc` casse sur `fr.ts` ET `en.ts` tant que les deux ne l'ont pas — c'est voulu ;
 * 3. une entrée à variable est une fonction `(x) => string`, jamais un gabarit à trous.
 *
 * ## Comment ajouter une LANGUE
 *
 * Un nouveau fichier `xx.ts` qui `satisfies Messages`, ajouté à `MESSAGES` dans
 * `locale.ts` et à l'union `Locale`. Le compilateur exige alors chaque clé : la porte est
 * ouverte, et elle refuse une langue incomplète.
 *
 * Les namespaces suivent les SURFACES, pas les fichiers — un même mot rendu à deux
 * endroits a une seule entrée (règle 9 appliquée à la copie).
 */
/** Un niveau de protection, dans ses trois registres (voir `privacyLevels`). */
export interface PrivacyLevelCopy {
  label: string;
  /** À quoi le niveau SERT — le registre des Réglages. */
  desc: string;
  /** Ce que le niveau COUVRE — le registre court du menu du composeur. */
  short: (brand: string) => string;
  /** Ce qu'il laisse lisible, ou ce que sa protection peut fausser. */
  tradeoff: string;
}

/**
 * Le NIVEAU DE PROTECTION, dans ses trois registres. Ils ne se remplacent pas :
 * `desc` + `tradeoff` servent les Réglages, où la décision se prend en connaissance de
 * cause ; `short` sert le menu du composeur, où elle se prend en passant, et dit ce qui
 * EST masqué plutôt que l'usage auquel le niveau convient.
 *
 * ⚠️ `tradeoff` n'est pas décoratif : sur-vendre la fiabilité serait le même bug de
 * confiance que sur-vendre la protection (règle 8). Le traduire, c'est traduire une
 * promesse — pas une étiquette.
 */
export interface PrivacyLevelsMessages {
  standard: PrivacyLevelCopy;
  renforce: PrivacyLevelCopy;
  strict: PrivacyLevelCopy;
}

/**
 * Les TYPES de donnée du redaction manuel. Les clés sont celles de `REDACT_TYPES`
 * (`@openmasq/redact`), qui garde le `token` du moteur — la MAISON du vocabulaire
 * technique reste là-bas, seule l'étiquette lue vient ici.
 * `redactTypes.parity.test.ts` lit les deux et échoue si l'une des listes bouge sans
 * l'autre : deux paquets ne peuvent pas s'imposer une clé par le compilateur.
 */
export interface RedactTypesMessages {
  name: string;
  username: string;
  email: string;
  phone: string;
  company: string;
  address: string;
  city: string;
  id: string;
  card: string;
  iban: string;
  ip: string;
  path: string;
  dob: string;
  secret: string;
}

/**
 * La carte qui INTERROMPT la boucle agentique avant sa première recherche web, pour
 * proposer un niveau plus généreux le temps d'un message.
 *
 * ⚠️ Règle 8 : chaque phrase ici est une PROMESSE sur ce qui quitte la machine. « Ce
 * message seulement » borne la portée, et la dernière phrase dit que la requête part de
 * toute façon avec la vraie valeur (règle 11). Traduire à la légère l'une ou l'autre,
 * c'est mentir sur le produit — pas se tromper d'étiquette.
 */
export interface WebNavMessages {
  ariaLabel: string;
  eyebrow: string;
  /** La PORTÉE, tenue courte : la ligne est coupée à l'ellipse par son conteneur. */
  thisMessageOnly: string;
  keepMasking: string;
  switchTo: (level: string) => string;
  title: (level: string) => string;
  /** Suit le `tradeoff` du niveau : ce qui reste masqué, et ce que la requête emporte. */
  rest: string;
}
