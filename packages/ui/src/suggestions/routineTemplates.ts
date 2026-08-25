import type { SuggestionBase } from "./suggestions";

/** One workflow template — a `WorkflowDraft` plus a stable id. */
export interface RoutineSuggestion extends SuggestionBase {
  /** Catalog connector ids (`@openmasq/catalog` MCP registry). Pinned by
   *  `suggestions.test.ts` against the registry — a renamed connector must
   *  break a test, not silently offer a template scoped to nothing. */
  servers: string[];
}

/**
 * The routines people ask for first, one per common connector family.
 *
 * ⚠️ ORDER MATTERS — the modal shows the first `ROUTINE_SUGGESTION_LIMIT`, and
 * a first-run user has NOTHING connected, so the connected-first ranking below
 * can't help them: catalog order is what they see. Hence the head of the list:
 *  1. a template that needs NO ACCOUNT at all (the built-in browser), so the
 *     first chip is launchable on the very first day — pinned by the test;
 *  2. then the everyday routines a ONE-CLICK connection can actually run —
 *     agenda, réunions, notes, canal — because a template whose service needs the
 *     user's own OAuth client is a wall, not a demo (see `ownKeysNeeded`);
 *  3. the ones gated behind « Mes clés » (Gmail read, Drive), kept and MARKED
 *     rather than hidden: they are the best argument for setting those keys up,
 *     and Google's audit is a temporary blocker;
 *  4. the dev-only ones LAST — useful, but a narrow audience should not fill a
 *     strip capped at six.
 *
 * Two rules the copy follows:
 *  - every template READS, none writes on its own — a write template that fires
 *    before the user has seen anything would make the write-confirm card the
 *    first thing they meet, and « montre-moi d'abord » is the habit worth
 *    seeding;
 *  - the values that change at each launch are `{accolades}`, the convention
 *    the modal's own note documents.
 */
export const ROUTINE_SUGGESTIONS: RoutineSuggestion[] = [
  {
    id: "comparer-offres",
    name: "Comparer des offres en ligne",
    desc: "Le navigateur va lire les sites et compare pour vous. Aucun compte requis.",
    servers: ["browser"],
    prompt: `Sur {site 1} et {site 2}, trouve {ce que je cherche}.

1. Un tableau comparatif : prix, disponibilité, conditions.
2. Ce qui diffère vraiment entre les deux, en trois lignes.
3. Ce que les pages ne disent pas et qu'il faudrait vérifier.

Lis seulement : ne remplis aucun formulaire et ne te connecte à aucun compte.`,
  },
  {
    // Agenda ONLY — deliberately. The mail step this used to carry needed
    // `gmail.readonly`, which turned the most everyday routine of the strip into a
    // « Mes clés » wall. `calendar.events` is sensitive, not restricted: one click.
    id: "preparer-journee",
    name: "Préparer ma journée",
    desc: "Vos rendez-vous, les participants, et ce qu'il faut avoir préparé.",
    servers: ["google-calendar"],
    prompt: `Prépare ma journée du {date}.

1. Mes rendez-vous dans l'ordre, avec les participants et le lieu.
2. Pour chacun : le sujet, et ce que je dois avoir préparé.
3. Ce qui se chevauche ou ne me laisse pas le temps de me déplacer.`,
  },
  {
    id: "compte-rendu-reunions",
    name: "Compte rendu de mes réunions",
    desc: "Décisions et actions tirées des transcriptions de la semaine.",
    servers: ["fireflies"],
    prompt: `Reprends mes réunions depuis {date}.

1. Pour chacune : le sujet, les participants, et les décisions prises.
2. Les actions qui me reviennent, avec l'échéance si elle a été dite.
3. Les sujets restés ouverts, à remettre à l'ordre du jour.

N'ajoute aucune décision qui n'apparaît pas dans les transcriptions.`,
  },
  {
    id: "recherche-notion",
    name: "Retrouver dans Notion",
    desc: "Cherche dans vos pages et répond avec les sources.",
    servers: ["notion"],
    prompt: `Cherche dans mon espace Notion ce qui concerne {sujet}.

1. Les pages trouvées, de la plus pertinente à la moins pertinente.
2. Ce que chacune dit sur la question, en deux lignes, avec le lien.
3. La réponse que ces pages permettent de donner — et ce qu'elles ne disent pas.

Ne modifie rien : lecture seule.`,
  },
  {
    id: "revue-boite-mail",
    name: "Revue de ma boîte mail",
    desc: "Trie les e-mails reçus et sort ce qui attend une réponse.",
    servers: ["gmail"],
    prompt: `Passe en revue mes e-mails reçus depuis {période, ex. hier 18 h}.

1. Ce qui attend une réponse de ma part, du plus urgent au moins urgent.
2. Ce qui est purement informatif, une ligne chacun.
3. Pour les trois plus urgents, propose un brouillon de réponse.

N'envoie rien : montre-moi d'abord.`,
  },
  {
    id: "point-hebdo-slack",
    name: "Point hebdo sur un canal",
    desc: "Décisions, questions en suspens et ce qui m'est adressé.",
    servers: ["slack"],
    prompt: `Relis les messages du canal {canal} sur les {nombre} derniers jours.

- Les décisions prises.
- Les questions restées sans réponse.
- Ce qui m'est adressé directement.

Termine par les trois choses à ne pas rater.`,
  },
  {
    id: "point-client",
    name: "Point sur un client",
    desc: "Rassemble échanges et documents autour d'un client, et dit où ça en est.",
    servers: ["gmail", "google-drive"],
    prompt: `Fais le point sur {client}.

1. Les derniers échanges par e-mail : qui a écrit quoi, et quand.
2. Les documents qui le concernent, avec leur date.
3. Ce qui est en attente de mon côté, et ce qui est en attente du sien.

Termine par la prochaine chose à faire. N'ajoute rien qui ne figure pas dans
les échanges ou les documents.`,
  },
  {
    id: "recherche-documents",
    name: "Retrouver un document",
    desc: "Cherche dans vos fichiers et résume ce qui répond à la question.",
    servers: ["google-drive"],
    prompt: `Cherche dans mes fichiers ce qui concerne {sujet}.

1. Les documents trouvés, du plus pertinent au moins pertinent, avec leur date.
2. Ce que chacun dit sur la question, en deux lignes.
3. La réponse que ces documents permettent de donner — et ce qu'ils ne disent pas.`,
  },
  {
    id: "point-paiements",
    name: "Point sur mes paiements",
    desc: "Encaissements, échecs et impayés de la période.",
    servers: ["stripe"],
    prompt: `Fais le point sur mes paiements depuis {date}.

1. Le total encaissé, et l'écart avec la période précédente.
2. Les paiements échoués ou contestés, avec le motif.
3. Les factures impayées, de la plus ancienne à la plus récente.

Consultation seule : ne crée, ne rembourse et n'annule rien.`,
  },
  {
    id: "veille-sujet",
    name: "Veille sur un sujet",
    desc: "Cherche le web et rend une synthèse sourcée.",
    servers: ["tavily"],
    prompt: `Fais une veille sur {sujet} pour les {nombre} derniers jours.

1. Les faits nouveaux, avec la source et la date de chacun.
2. Ce que cela change concrètement, en trois lignes.
3. Ce que tu n'as PAS trouvé et qui manquerait pour conclure.

Cite tes sources et ne conclus rien qu'elles ne disent pas.`,
  },
  {
    id: "revue-depot",
    name: "Revue de dépôt",
    desc: "PR ouvertes, revues en attente, issues les plus actives.",
    servers: ["github"],
    prompt: `Fais le point sur le dépôt {dépôt}.

1. Les pull requests ouvertes : depuis quand, et qui attend quoi.
2. Celles qui attendent ma revue.
3. Les issues les plus actives des {nombre} derniers jours.

Une ligne par élément, avec le lien.`,
  },
  {
    id: "suivi-projet",
    name: "Suivi de projet",
    desc: "Ce qui avance, ce qui bloque, ce qui a glissé.",
    servers: ["linear"],
    prompt: `Fais le point sur le projet {projet}.

- Ce qui a été terminé depuis {date}.
- Ce qui est en cours, et depuis combien de temps.
- Ce qui est bloqué ou en retard, avec la raison si elle est notée.

Termine par les risques que tu vois pour l'échéance.`,
  },
  {
    id: "erreurs-semaine",
    name: "Erreurs de la semaine",
    desc: "Les erreurs qui montent, triées par impact.",
    servers: ["sentry"],
    prompt: `Liste les erreurs remontées sur {projet} depuis {date}.

1. Les nouvelles erreurs, par nombre d'occurrences.
2. Celles qui augmentent le plus par rapport à la période précédente.
3. Pour les trois premières : où elles se déclenchent, et ce que tu en déduis.`,
  },
];
