/**
 * Les ERREURS D'ENVOI, telles qu'un utilisateur les lit.
 *
 * ⚠️ Chaque entrée nomme UNE cause et UN geste. La première question devant un envoi
 * raté est « est-ce que quelque chose est parti ? » — c'est pourquoi « rien n'est parti »
 * s'écrit en toutes lettres là où c'est vrai, et nulle part ailleurs. Une traduction qui
 * l'ajoute par symétrie ment sur le produit ; une qui l'enlève laisse la question ouverte.
 *
 * ⚠️ Ce qui n'est PAS ici : la prose destinée au MODÈLE (`send/inboundScreen.ts`, les
 * consignes du classifieur), qui suit la langue de la CONVERSATION et non celle de
 * l'interface — même exclusion que `agent/` et `prompt/` dans le cliquet `check:i18n`.
 * Ni les libellés du journal de débogage, qui sont techniques par destination.
 *
 * Une TRANCHE du contrat (`../messages.ts`), qui reste la seule liste des namespaces.
 */
export interface ErrorsMessages {
  /** Le fournisseur, quand l'appelant n'a pas su le nommer. */
  theProvider: string;
  atProvider: (provider: string) => string;

  creditsUnverifiable: string;
  modelNotAllowed: (brand: string) => string;
  upstreamUnavailable: (brand: string) => string;
  providerCreditsNamed: (provider: string) => string;
  providerCredits: string;
  invalidKeyNamed: (provider: string) => string;
  invalidKey: string;
  /** Rafale : une attente courte, annoncée quand la passerelle la donne. */
  rateBurst: (wait: string) => string;
  someSeconds: string;
  /** Quota journalier épuisé. `freeCap` n'est dit que quand le corps affirme la gratuité. */
  freeCap: (limit: string) => string;
  freeCapPlain: string;
  dailyExhausted: (cap: string, when: string) => string;
  quotaExhausted: (atProvider: string, when: string) => string;
  resetsAt: (when: string) => string;
  modelStall: string;

  /** Les attentes et les reprises, dans les unités qu'on lit d'un coup d'œil. */
  waitSeconds: (seconds: number) => string;
  waitMinutes: (minutes: number) => string;
  resetToday: (time: string) => string;
  resetTomorrow: (time: string) => string;
  resetOnDate: (date: string, time: string) => string;

  /** Le quota RESTANT, annoncé pendant qu'il reste de quoi agir. Zéro est sa propre
   *  phrase : « il reste 0 » se lit comme un décompte, pas comme le mur qu'on touche. */
  quotaResetsAt: (when: string) => string;
  quotaEmpty: (when: string) => string;
  quotaLeft: (remaining: number, ofLimit: string, when: string) => string;
  quotaOfLimit: (limit: number) => string;

  /** Trois issues d'un envoi, dites à l'utilisateur — pas au journal. */
  interruptedBeforeSend: string;
  exportedFileLost: string;
  replyInterrupted: string;
  replyNeverStarted: string;
}
