// La garde « CONSULTER ≠ AGIR », sœur de « RÉDIGER ≠ ENVOYER » (`sendIntent.ts`) et
// extraite pour la même raison (règle 1 : `mcpAgentClassify.ts` reste sous le plafond).

/**
 * « CONSULTER » n'est pas « AGIR » — la garde déterministe.
 *
 * Journal du 27/07/2026 : « Prépare ma journée : mes rendez-vous dans l'ordre, avec les
 * participants et le lieu. » Le modèle n'a JAMAIS lu l'agenda — il a appelé
 * `google-calendar__create_event` et posé dans l'agenda réel un événement inventé de
 * bout en bout, participants et salle compris.
 *
 * Ce n'est pas rattrapé par la confirmation : en mode `standard` (le défaut),
 * `CONFIRMATION_POLICY` ne fait apparaître AUCUNE carte pour une écriture ordinaire tant
 * que la conversation n'a pas touché le web — la création part sans que rien ne
 * s'affiche. Le prompt système interdit déjà d'agir sans qu'on le demande, mais un
 * prompt est une prière : la boucle refuse donc ELLE-MÊME toute écriture quand le
 * DERNIER message utilisateur ne demandait qu'à consulter.
 *
 * ## Le sens des faux positifs — c'est ce qui rend les listes ci-dessous asymétriques
 *
 * Un verbe d'ACTION oublié SUR-BLOQUE (une écriture légitime est refusée, l'utilisateur
 * doit la redemander). Un verbe d'action de trop DÉSACTIVE la garde, c'est-à-dire rend
 * le comportement actuel. La liste d'ACTION est donc volontairement GÉNÉREUSE — c'est
 * le côté sûr — et la liste de CONSULTATION plus mesurée : l'y manquer ne coûte, là
 * aussi, que le comportement actuel.
 */

// ⚠️ Frontières en lookaround Unicode, jamais `\b` (ASCII) — définition partagée.
import { EDGE_L, EDGE_R } from "../send/wordEdges";

/**
 * Tout ce qui MODIFIE quelque chose chez l'utilisateur ou chez un tiers. Généreuse par
 * construction (voir l'en-tête) : les radicaux couvrent impératif, infinitif et 2ᵉ
 * personne du pluriel d'un coup (`cr[ée]e[rz]?` → crée / créer / créez).
 */
const ACT_VERB = new RegExp(
  `${EDGE_L}(?:` +
    // créer / ajouter
    `cr[ée]e[rz]?|cr[ée]ation|ajoute[rz]?|ajouter|ins[èe]re[rz]?|ins[ée]rer|` +
    // agenda
    `planifie[rz]?|planifier|programme[rz]?|programmer|r[ée]serve[rz]?|r[ée]server|` +
    `bloque[rz]?|bloquer|invite[rz]?|inviter|convie[rz]?|convier|reporte[rz]?|reporter|` +
    // modifier / supprimer. `mets à jour` est une locution : sans elle, « … puis mets à
    // jour l'item monday en Payé » se lisait comme une simple consultation et l'écriture
    // finale était refusée (scénario `wf2-facturation-croisee`).
    `modifie[rz]?|modifier|change[rz]?|changer|[ée]dite[rz]?|[ée]diter|` +
    `mets?[ ][àa][ ]jour|mettre[ ][àa][ ]jour|mettez[ ][àa][ ]jour|mise[ ][àa][ ]jour|` +
    `bascule[rz]?|basculer|` +
    // ouvrir/signaler : « ouvre une issue », « préviens le canal » sont des créations,
    // pas des lectures (scénario `wf2-incident-monitoring`).
    `ouvre[rz]?|ouvrir|pr[ée]viens|pr[ée]venir|pr[ée]venez|signale[rz]?|signaler|` +
    `d[ée]clare[rz]?|d[ée]clarer|commente[rz]?|commenter|lance[rz]?|lancer|notant|` +
    `renomme[rz]?|renommer|remplace[rz]?|remplacer|corrige[rz]?|corriger|` +
    `supprime[rz]?|supprimer|efface[rz]?|effacer|retire[rz]?|retirer|` +
    `annule[rz]?|annuler|archive[rz]?|archiver|ferme[rz]?|fermer|cl[ôo]ture[rz]?|` +
    // faire partir
    `envoie[sz]?|envoyer|envoyez|transmets|transmettez|transmettre|` +
    `exp[ée]die[rz]?|exp[ée]dier|poste[rz]?|poster|publie[rz]?|publier|` +
    `partage[rz]?|partager|diffuse[rz]?|diffuser|r[ée]ponds|r[ée]pondre|r[ée]pondez|` +
    // écrire quelque part
    `enregistre[rz]?|enregistrer|sauvegarde[rz]?|sauvegarder|d[ée]pose[rz]?|d[ée]poser|` +
    `[ée]cris|[ée]crire|[ée]crivez|r[ée]dige[rz]?|r[ée]diger|` +
    `t[ée]l[ée]verse[rz]?|t[ée]l[ée]verser|importe[rz]?|importer|` +
    // assigner / marquer
    `assigne[rz]?|assigner|attribue[rz]?|attribuer|coche[rz]?|cocher|marque[rz]?|marquer|` +
    // navigateur : agir sur une page
    `clique[rz]?|cliquer|remplis|remplir|remplissez|valide[rz]?|valider|soumets|soumettre|` +
    // EN
    `create|add|insert|schedule|book|invite|move|reschedule|update|modify|change|rename|` +
    `delete|remove|cancel|archive|close|send|post|publish|share|save|store|upload|` +
    `write|draft|assign|submit|click|fill` +
    `)${EDGE_R}`,
  "iu",
);

/**
 * « Déplacer » / « décaler », séparés du bloc ci-dessus pour UNE raison : ils sont les
 * seuls verbes d'action de la liste dont l'emploi RÉFLÉCHI décrit l'utilisateur au lieu
 * d'instruire l'assistant. « Ce qui ne me laisse pas le temps de me déplacer » — la
 * phrase exacte du journal du 27/07/2026 — décrit un trajet, pas un événement à bouger,
 * et lisait toute la demande comme un ordre d'agir.
 *
 * La restriction est volontairement limitée à ces deux verbes : l'appliquer à tout le
 * bloc retournerait la garde contre elle-même sur « peux-tu me créer un événement »,
 * où le pronom est un objet indirect parfaitement ordinaire.
 */
const ACT_MOVE = new RegExp(
  `${EDGE_L}(?<!(?:me|te|se|s['’])[ ])(?:d[ée]place[rz]?|d[ée]placer|d[ée]cale[rz]?|d[ée]caler)${EDGE_R}`,
  "iu",
);

/**
 * Une INTERDICTION explicite d'agir. Elle est traitée EN PREMIER et elle est
 * SUFFISANTE : « Lecture seule : ne crée, ne modifie et n'envoie rien. » contient trois
 * verbes d'action, donc sans ce passage préalable la demande se lirait comme un ordre
 * d'agir — exactement le retournement corrigé dans `sendIntent.ts` pour « n'envoie
 * rien ». Nos propres modèles de workflow écrivent cette phrase (`suggestions/
 * routineTemplates.ts`, `routineGeneric.ts`), donc le cas est la règle, pas l'exception.
 */
const NO_ACT = new RegExp(
  `${EDGE_L}(?:` +
    `lecture[ ]seule|consultation[ ]seule|read[- ]only|` +
    // « ne crée rien », « n'écris rien », « ne modifie rien », « ne rien créer »…
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
 * Ce qui demande de REGARDER. Verbes ET tournures : « Prépare ma journée » n'a aucun
 * verbe de consultation, c'est la SUITE (« Mes rendez-vous dans l'ordre… ») qui dit que
 * la demande est une lecture — d'où les groupes nominaux.
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
    // Tournures : la demande de lecture qui ne porte pas de verbe de lecture.
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
 * « Lecture seule » et ses variantes : un marqueur qui gouverne le MESSAGE ENTIER, pas une
 * clause. Il reste absolu — c'est la tournure qu'écrivent nos propres modèles de workflow
 * quand l'utilisateur ne veut RIEN qui agisse.
 */
const READ_ONLY_GLOBAL = /lecture[ ]seule|consultation[ ]seule|read[- ]only/iu;

/** La clause interdictrice, du mot d'interdiction jusqu'à la fin de sa proposition. La
 *  borne inclut « : » et « — » parce qu'une interdiction s'y termine couramment (« n'envoie
 *  rien : montre-moi d'abord »), et elle emporte les verbes COORDONNÉS de la même clause
 *  (« do not create or modify anything ») — sans quoi le second verbe se relirait comme une
 *  demande d'agir, ce qui est exactement le retournement que la règle 1 évite. */
const PROHIBITION_CLAUSE = new RegExp(`(?:${NO_ACT.source})[^.;:\\n—]*`, "giu");

/** Le message, ses clauses interdictrices ôtées. */
function stripProhibitionClauses(text: string): string {
  return text.replace(PROHIBITION_CLAUSE, " ");
}

/**
 * La demande se limite-t-elle à CONSULTER ?
 *
 * Trois cas, dans cet ordre — l'ordre EST la règle, comme pour `asksDraftNotSend` :
 *  1. une interdiction explicite d'agir ⇒ oui, quoi qu'il y ait d'autre dans le message
 *     (« ne crée, ne modifie et n'envoie rien » contient trois verbes d'action) ;
 *  2. sinon, un verbe d'action ⇒ non (sur-bloquer un « crée » explicite serait aussi
 *     grave que laisser passer la création fantôme) ;
 *  3. sinon, une demande de consultation ⇒ oui.
 *
 * Rien de reconnu ⇒ `false` : l'inconnu garde le comportement actuel, la garde
 * n'ajoute jamais de blocage sur une demande qu'elle ne comprend pas.
 */
export function asksConsultNotAct(text: string | undefined | null): boolean {
  if (!text) return false;
  // Un marqueur GLOBAL gouverne tout le message, quoi qu'il contienne d'autre.
  if (READ_ONLY_GLOBAL.test(text)) return true;
  if (NO_ACT.test(text)) {
    // ⚠️ Une interdiction n'annule que SA CLAUSE, pas la demande qui la précède. « Crée une
    // page… NE MODIFIE AUCUNE PAGE EXISTANTE » borne le périmètre, elle ne renonce pas à la
    // création — et la lire comme un renoncement refusait l'écriture À CAUSE de la prudence
    // de l'utilisateur (mesuré le 15/08/2026 : Notion, refus, « demande de consulter »).
    // On retire donc la clause interdictrice et on redemande au reste s'il commande une
    // action ; s'il n'en commande aucune, on retombe exactement sur l'ancien verdict.
    const reste = stripProhibitionClauses(text);
    if (ACT_VERB.test(reste) || ACT_MOVE.test(reste)) return false;
    return true;
  }
  if (ACT_VERB.test(text) || ACT_MOVE.test(text)) return false;
  return CONSULT.test(text);
}

/** Ce que le modèle reçoit à la place du résultat : la consigne, pas une erreur. */
export const CONSULT_NOT_ACT_STEER =
  "Action REFUSÉE : l'utilisateur a demandé de CONSULTER, pas de MODIFIER. Rien n'a été " +
  "créé, modifié ni supprimé. Utilise les outils de LECTURE pour aller chercher " +
  "l'information demandée et réponds dans la conversation. Si tu penses qu'une écriture " +
  "est nécessaire, PROPOSE-la en une phrase et attends que l'utilisateur la demande " +
  "explicitement (« crée-le », « ajoute-le »). N'invente jamais de données à écrire.";
