// The "CONSULT ≠ ACT" guard, sibling of "DRAFT ≠ SEND" (`sendIntent.ts`) and
// extracted for the same reason (rule 1: `mcpAgentClassify.ts` stays under the cap).

/**
 * "CONSULTING" is not "ACTING" — the deterministic guard.
 *
 * Journal from 27/07/2026: "Prepare my day: my appointments in order, with the
 * participants and location." The model NEVER read the calendar — it called
 * `google-calendar__create_event` and put a fully invented event, participants and
 * room included, into the REAL calendar.
 *
 * Confirmation doesn't catch this: in `standard` mode (the default),
 * `CONFIRMATION_POLICY` shows NO card at all for an ordinary write as long as the
 * conversation hasn't touched the web — the creation goes out with nothing shown.
 * The system prompt already forbids acting without being asked, but a prompt is a
 * prayer: the loop therefore refuses ANY write ITSELF when the LAST user message only
 * asked to consult.
 *
 * ## What false positives mean — this is what makes the lists below asymmetric
 *
 * A missed ACTION verb OVER-BLOCKS (a legitimate write is refused, the user has to
 * ask again). One extra action verb DISABLES the guard, i.e. restores current
 * behaviour. The ACTION list is therefore deliberately GENEROUS — that's the safe
 * side — and the CONSULT list more measured: missing one there only costs, likewise,
 * current behaviour.
 */

// ⚠️ Boundaries via Unicode lookaround, never `\b` (ASCII) — shared definition.
import { EDGE_L, EDGE_R } from "../send/wordEdges";

/**
 * Everything that MODIFIES something for the user or for a third party. Generous by
 * construction (see the header): the stems cover imperative, infinitive and 2nd
 * person plural at once (`cr[ée]e[rz]?` → crée / créer / créez).
 */
const ACT_VERB = new RegExp(
  `${EDGE_L}(?:` +
    // create / add
    `cr[ée]e[rz]?|cr[ée]ation|ajoute[rz]?|ajouter|ins[èe]re[rz]?|ins[ée]rer|` +
    // calendar
    `planifie[rz]?|planifier|programme[rz]?|programmer|r[ée]serve[rz]?|r[ée]server|` +
    `bloque[rz]?|bloquer|invite[rz]?|inviter|convie[rz]?|convier|reporte[rz]?|reporter|` +
    // modify / delete. `mets à jour` is a set phrase: without it, "… then update the
    // monday item to Paid" read as a plain consultation and the final write was
    // refused (scenario `wf2-facturation-croisee`).
    `modifie[rz]?|modifier|change[rz]?|changer|[ée]dite[rz]?|[ée]diter|` +
    `mets?[ ][àa][ ]jour|mettre[ ][àa][ ]jour|mettez[ ][àa][ ]jour|mise[ ][àa][ ]jour|` +
    `bascule[rz]?|basculer|` +
    // open/report: "open an issue", "notify the channel" are creations, not reads
    // (scenario `wf2-incident-monitoring`).
    `ouvre[rz]?|ouvrir|pr[ée]viens|pr[ée]venir|pr[ée]venez|signale[rz]?|signaler|` +
    `d[ée]clare[rz]?|d[ée]clarer|commente[rz]?|commenter|lance[rz]?|lancer|notant|` +
    `renomme[rz]?|renommer|remplace[rz]?|remplacer|corrige[rz]?|corriger|` +
    `supprime[rz]?|supprimer|efface[rz]?|effacer|retire[rz]?|retirer|` +
    `annule[rz]?|annuler|archive[rz]?|archiver|ferme[rz]?|fermer|cl[ôo]ture[rz]?|` +
    // send out
    `envoie[sz]?|envoyer|envoyez|transmets|transmettez|transmettre|` +
    `exp[ée]die[rz]?|exp[ée]dier|poste[rz]?|poster|publie[rz]?|publier|` +
    `partage[rz]?|partager|diffuse[rz]?|diffuser|r[ée]ponds|r[ée]pondre|r[ée]pondez|` +
    // write somewhere
    `enregistre[rz]?|enregistrer|sauvegarde[rz]?|sauvegarder|d[ée]pose[rz]?|d[ée]poser|` +
    `[ée]cris|[ée]crire|[ée]crivez|r[ée]dige[rz]?|r[ée]diger|` +
    `t[ée]l[ée]verse[rz]?|t[ée]l[ée]verser|importe[rz]?|importer|` +
    // assign / mark
    `assigne[rz]?|assigner|attribue[rz]?|attribuer|coche[rz]?|cocher|marque[rz]?|marquer|` +
    // browser: act on a page
    `clique[rz]?|cliquer|remplis|remplir|remplissez|valide[rz]?|valider|soumets|soumettre|` +
    // EN
    `create|add|insert|schedule|book|invite|move|reschedule|update|modify|change|rename|` +
    `delete|remove|cancel|archive|close|send|post|publish|share|save|store|upload|` +
    `write|draft|assign|submit|click|fill` +
    `)${EDGE_R}`,
  "iu",
);

/**
 * "Déplacer" / "décaler" (move/shift), separated from the block above for ONE reason:
 * they are the only action verbs in the list whose REFLEXIVE use describes the user
 * instead of instructing the assistant. "Ce qui ne me laisse pas le temps de me
 * déplacer" (which leaves me no time to get there) — the exact phrase from the journal
 * of 27/07/2026 — describes a trip, not an event to move, and read the whole request
 * as an order to act.
 *
 * The restriction is deliberately limited to these two verbs: applying it to the whole
 * block would turn the guard against itself on "peux-tu me créer un événement" (can
 * you create an event for me), where the pronoun is a perfectly ordinary indirect object.
 */
const ACT_MOVE = new RegExp(
  `${EDGE_L}(?<!(?:me|te|se|s['’])[ ])(?:d[ée]place[rz]?|d[ée]placer|d[ée]cale[rz]?|d[ée]caler)${EDGE_R}`,
  "iu",
);

/**
 * An explicit PROHIBITION on acting. It is handled FIRST and it is SUFFICIENT:
 * "Read only: don't create, don't modify and don't send anything." contains three
 * action verbs, so without this preliminary pass the request would read as an order
 * to act — exactly the reversal fixed in `sendIntent.ts` for "send nothing". Our own
 * workflow templates write this phrase (`suggestions/routineTemplates.ts`,
 * `routineGeneric.ts`), so the case is the rule, not the exception.
 */
const NO_ACT = new RegExp(
  `${EDGE_L}(?:` +
    `lecture[ ]seule|consultation[ ]seule|read[- ]only|` +
    // "ne crée rien", "n'écris rien", "ne modifie rien", "ne rien créer"…
    `n['’ ]?(?:e[ ]?)?(?:le[ ]?|la[ ]?|les[ ]?|lui[ ]?|y[ ]?)?(?:cr[ée]e|[ée]cris|modifie|` +
    `supprime|envoie|ajoute|publie|poste|partage|enregistre|d[ée]place|annule|r[ée]serve)|` +
    `ne[ ]rien[ ](?:cr[ée]er|[ée]crire|modifier|supprimer|envoyer|ajouter|publier|changer)|` +
    `ne[ ]pas[ ](?:cr[ée]er|[ée]crire|modifier|supprimer|envoyer|ajouter|publier|changer)|` +
    `sans[ ](?:rien[ ])?(?:cr[ée]er|[ée]crire|modifier|supprimer|envoyer|ajouter|changer)|` +
    `do[ ]?n['’]?t[ ](?:create|write|modify|change|delete|send|add|post)|` +
    `do[ ]not[ ](?:create|write|modify|change|delete|send|add|post)|` +
    `without[ ](?:creating|writing|modifying|changing|deleting|sending)` +
    `)`,
  "iu",
);

/**
 * What asks to LOOK. Verbs AND phrasings: "Prepare my day" has no consult verb at all,
 * it's the FOLLOW-UP ("my appointments in order…") that says the request is a read —
 * hence the noun groups.
 */
const CONSULT = new RegExp(
  `(?:${EDGE_L}(?:` +
    `liste[rz]?|lister|montre[rz]?|montrer|affiche[rz]?|afficher|` +
    `r[ée]sume[rz]?|r[ée]sumer|r[ée]capitule[rz]?|synth[ée]tise[rz]?|` +
    `donne-?moi|dis-?moi|indique[rz]?|pr[ée]cise[rz]?|` +
    `quel|quels|quelle|quelles|combien|` +
    `consulte[rz]?|consulter|regarde[rz]?|regarder|v[ée]rifie[rz]?|v[ée]rifier|` +
    `cherche[rz]?|chercher|trouve[rz]?|trouver|retrouve[rz]?|retrouver|` +
    `r[ée]cup[èe]re[rz]?|r[ée]cup[ée]rer|identifie[rz]?|identifier|` +
    `analyse[rz]?|analyser|compare[rz]?|comparer|croise[rz]?|croiser|` +
    `relis|relire|lis|lire|` +
    `list|show|display|summari[sz]e|tell[ ]me|give[ ]me|which|how[ ]many|` +
    `find|check|review|read|compare|analy[sz]e` +
    `)${EDGE_R})` +
    // Phrasings: a read request that carries no read verb.
    `|(?:qu['’ ]?est-ce[ ]que[ ]j['’]ai|qu['’]ai-je|ce[ ]que[ ]j['’]ai|` +
    `fais[ ]le[ ]point|faire[ ]le[ ]point|point[ ]sur|passe[ ]en[ ]revue|revue[ ]de[ ]` +
    `|o[ùu][ ]en[ ](?:est|sont|suis)|` +
    `pr[ée]pare[rz]?[ ]m(?:a|es)[ ](?:journ[ée]e|semaine|r[ée]unions?)|` +
    `mes[ ](?:rendez-?vous|rdv|e-?mails|mails|messages|tickets|r[ée]unions|documents|` +
    `fichiers|notes|paiements|factures|t[âa]ches)|` +
    `mon[ ](?:agenda|calendrier|planning)|[àa][ ](?:mon[ ]|l['’])agenda|` +
    `what['’ ]?s[ ]on[ ]my|what[ ]do[ ]i[ ]have)`,
  "iu",
);

/**
 * "Read only" and its variants: a marker that governs the WHOLE MESSAGE, not one
 * clause. It stays absolute — it's the phrasing our own workflow templates write
 * when the user wants NOTHING that acts.
 */
const READ_ONLY_GLOBAL = /lecture[ ]seule|consultation[ ]seule|read[- ]only/iu;

/** The prohibiting clause, from the prohibition word to the end of its own clause. The
 *  boundary includes ":" and "—" because a prohibition commonly ends there ("don't send
 *  anything: show me first"), and it carries along the verbs COORDINATED in the same
 *  clause ("do not create or modify anything") — without which the second verb would
 *  re-read as an order to act, exactly the reversal rule 1 avoids. */
const PROHIBITION_CLAUSE = new RegExp(`(?:${NO_ACT.source})[^.;:\\n—]*`, "giu");

/** The message, with its prohibiting clauses stripped out. */
function stripProhibitionClauses(text: string): string {
  return text.replace(PROHIBITION_CLAUSE, " ");
}

/**
 * Does the request only ask to CONSULT?
 *
 * Three cases, in this order — the order IS the rule, as for `asksDraftNotSend`:
 *  1. an explicit prohibition on acting ⇒ yes, whatever else is in the message
 *     ("don't create, don't modify and don't send anything" contains three action
 *     verbs);
 *  2. otherwise, an action verb ⇒ no (over-blocking an explicit "create" would be as
 *     serious as letting the phantom creation through);
 *  3. otherwise, a consult request ⇒ yes.
 *
 * Nothing recognised ⇒ `false`: the unknown keeps current behaviour, the guard never
 * adds a block on a request it doesn't understand.
 */
export function asksConsultNotAct(text: string | undefined | null): boolean {
  if (!text) return false;
  // A GLOBAL marker governs the whole message, whatever else it contains.
  if (READ_ONLY_GLOBAL.test(text)) return true;
  if (NO_ACT.test(text)) {
    // ⚠️ A prohibition cancels only ITS CLAUSE, not the request preceding it. "Create a
    // page… DON'T MODIFY ANY EXISTING PAGE" bounds the scope, it doesn't give up the
    // creation — and reading it as a waiver refused the write BECAUSE OF the user's own
    // caution (measured 15/08/2026: Notion, refusal, "consult request").
    // So we strip the prohibiting clause and ask the rest again whether it commands an
    // action; if it commands none, we fall back exactly to the old verdict.
    const reste = stripProhibitionClauses(text);
    if (ACT_VERB.test(reste) || ACT_MOVE.test(reste)) return false;
    return true;
  }
  if (ACT_VERB.test(text) || ACT_MOVE.test(text)) return false;
  return CONSULT.test(text);
}

/** What the model receives instead of the result: the instruction, not an error. */
export const CONSULT_NOT_ACT_STEER =
  "Action REFUSÉE : l'utilisateur a demandé de CONSULTER, pas de MODIFIER. Rien n'a été " +
  "créé, modifié ni supprimé. Utilise les outils de LECTURE pour aller chercher " +
  "l'information demandée et réponds dans la conversation. Si tu penses qu'une écriture " +
  "est nécessaire, PROPOSE-la en une phrase et attends que l'utilisateur la demande " +
  "explicitement (« crée-le », « ajoute-le »). N'invente jamais de données à écrire.";
