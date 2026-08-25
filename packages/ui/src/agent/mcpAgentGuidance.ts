import { BRAND } from "@openmasq/branding";
import { INTERRUPTED_TOOL_RESULT, TIMED_OUT_WRITE_RESULT } from "./turnCheckpoint";
import type { ChatMessage } from "@openmasq/llm";
import { LANGUAGE_REMINDER } from "../prompt/systemPrompt";
import { pythonGuidance, webToolPhrase } from "./mcpAgentPython";
// Préfixe des helpers Python définis par le préambule du runtime (apps/desktop) —
// des noms RUNTIME côté sandbox, donc dérivés de la marque, jamais littéraux ici.
const PY = BRAND.slug;


// Python-interpreter guidance + failure hints live in `mcpAgentPython.ts` (rule 1) —
// re-exported here so importers never learn the split happened.
export { pythonFailReason, pythonErrorHint, webToolPhrase } from "./mcpAgentPython";

// Idem pour la MAUVAISE fin de tour — la reconnaître et la dire : `mcpAgentOutcome.ts`.
// Ce fichier-ci ne garde que ce qu'on dit au modèle AVANT qu'il agisse.
// Une faute de RECOPIE d'identifiant est la seule panne d'outil qu'on sache réparer à la
// place du modèle — la bonne valeur est encore dans un résultat précédent.
export { opaqueIdsIn, identifierTypoHint } from "./identifierTypo";
export {
  repeatedFailureOf,
  isBrowserBackendFault,
  BROWSER_BACKEND_FAULT_MESSAGE,
  confirmActLabel,
  capRefusalNote,
  exhaustionMessage,
  looksLikeRefusal,
} from "./mcpAgentOutcome";

// System-prompt guidance + prose classifiers for the agentic MCP loop — all pure,
// wire-safe (no PII), unit-tested; split from `mcpAgent.ts` (rule 1).

/** Static guidance prepended to the agentic loop's system prompt (tools ARE
 *  connected here) — weak models otherwise explain a manual procedure or claim
 *  they can't act instead of calling the tool. No PII, so it's wire-safe. */
// ⚠️ The language rule lives ONCE in `prompt/systemPrompt.ts` — both paths need it.
const TOOL_USE_GUIDANCE =
  "Tu disposes d'outils connecteurs déjà connectés. Dès qu'une demande correspond à une action qu'un de ces outils permet (rechercher, ouvrir, dupliquer, modifier, exporter ou télécharger un design ou un fichier existant, ou agir sur un service connecté), APPELLE l'outil approprié plutôt que d'expliquer une procédure manuelle. N'affirme jamais que tu ne peux pas effectuer une action sans avoir d'abord tenté l'outil correspondant. " +
  "IMPORTANT — rédiger un contenu n'est PAS écrire un fichier : si l'utilisateur demande de RÉDIGER, GÉNÉRER, CRÉER ou PRÉPARER un contenu (un procès-verbal, un courrier, un texte, un tableau, du code…) SANS demander explicitement de l'ENREGISTRER/SAUVEGARDER sur le disque et sans nommer le fichier ou le service où le placer, RÉPONDS directement dans la conversation avec ce contenu — n'appelle PAS `write_file` et n'invente AUCUN chemin de fichier. N'utilise un connecteur de FICHIERS (lecture/écriture sur le disque) QUE si l'utilisateur demande explicitement de lire, d'enregistrer ou de modifier un fichier. De même, RÉDIGER un e-mail ou un message n'est PAS l'ENVOYER : sans demande EXPLICITE d'envoi (« envoie », « envoie-le », « transmets »…), présente le texte rédigé dans la conversation (bloc document) et n'appelle AUCUN outil d'envoi (`send_email`, `send_message`…) — l'utilisateur décidera ensuite de l'envoyer. " +
  // Mesuré le 28/07/2026 : « fais de la veille sur les fournisseurs de X » — le web ne
  // rend rien sur une PME privée, et le modèle en tire trois sections dont « l'absence
  // d'actualités suggère une stabilité de la chaîne d'approvisionnement ». C'est une
  // conclusion tirée du néant, présentée comme un constat. La règle du produit est la
  // même partout : une panne réelle se dit, elle ne s'habille pas.
  "RIEN TROUVÉ se dit en une phrase, et ne se déduit pas. Si une recherche ne rend aucun résultat utile, dis-le simplement et arrête-toi là : ne tire AUCUNE conclusion de l'absence (ne pas trouver d'actualité sur une entreprise ne prouve ni sa stabilité, ni sa santé, ni quoi que ce soit), ne remplis pas la réponse de sections vides, et ne reformule pas le vide en plusieurs points pour lui donner du volume. Propose plutôt ce qui débloquerait : une source précise, une orthographe, un site officiel. " +
  // Le cas signalé : la fiche mémoire de l'entreprise ÉTAIT injectée (« Mémoire utilisée »)
  // et le modèle a quand même répondu comme s'il ne savait rien d'elle.
  "Ce que la MÉMOIRE t'a déjà donné sur une personne ou une organisation nommée dans la demande fait partie de ta réponse : sers-t'en pour cadrer la recherche (secteur, taille, ville, année) et pour répondre quand le web n'ajoute rien — ne réponds jamais comme si tu ne savais rien d'une entité dont le contexte te décrit déjà. " +
  "Les arguments de chaque appel d'outil DOIVENT être un objet JSON strictement valide et conforme au schéma de l'outil (guillemets doubles fermés, pas de virgule finale, types respectés). Si un outil renvoie deux fois de suite un résultat vide ou identique, NE répète PAS le même appel : change d'approche (autres paramètres, autre outil) ou explique à l'utilisateur ce qui bloque. " +
  "RAPIDITÉ — quand plusieurs LECTURES indépendantes sont nécessaires (consulter l'agenda ET les e-mails ET un CRM…), émets TOUS ces appels de lecture ENSEMBLE dans le MÊME tour, pas un par un : ils s'exécutent en parallèle. Séquence uniquement quand un appel a besoin du RÉSULTAT d'un autre (et les écritures restent une par une). " +
  "Choisis l'opération qui correspond EXACTEMENT à l'action voulue : créer, lire, METTRE À JOUR et supprimer sont des opérations DISTINCTES. Pour MODIFIER une ressource existante, l'opération vise son identifiant (typiquement un chemin `/ressource/{id}`) et diffère de la création — n'utilise JAMAIS l'opération de CRÉATION avec un id pour faire une mise à jour, tu créerais un DOUBLON. Si la recherche ne renvoie pas l'opération de mise à jour, NE conclus pas qu'elle n'existe pas : découvre le chemin de la ressource via son opération de LECTURE/récupération, puis cible la MÊME ressource identifiée en écriture. Utilise TOUJOURS les noms d'opération réellement exposés par le connecteur — n'en invente pas. Ne te rabats jamais sur une opération différente de l'action demandée. " +
  "BASES DE DONNÉES (SQL, Neon, Supabase…) : inspecte le schéma UNE SEULE FOIS (lister les tables/colonnes), puis compose UNE requête qui répond à toute la demande — filtres, jointures et agrégation compris. N'enchaîne PAS des dizaines de petites requêtes exploratoires : deux ou trois appels au maximum suffisent (schéma, éventuellement un aperçu, puis la requête finale). Si une requête échoue, corrige-la ; ne la relance pas à l'identique.";

// Browser enableable but NOT connected: steer to enabling the free built-in browser
// (never a paid search connector, never a confident unverified answer).
export const BROWSER_ENABLE_HINT =
  "\n\n🌐 Un NAVIGATEUR web intégré (gratuit, sans clé) est disponible mais PAS encore activé. " +
  "Si la demande nécessite de CHERCHER ou CONSULTER le web, NE propose PAS de connecter un outil externe " +
  "(Exa, Tavily, Firecrawl…) et n'invente PAS de réponse : appelle `suggest_integrations` avec " +
  "`integration_ids: [\"browser\"]` — l'utilisateur obtiendra une carte pour l'activer en un geste — puis " +
  "explique brièvement que tu pourras consulter le web une fois le navigateur activé. À défaut, réponds " +
  "uniquement de mémoire en précisant EXPLICITEMENT que l'information n'a pas été vérifiée sur le web et " +
  "peut être datée ou inexacte.";

/** Appended when the controllable BROWSER connector is connected: steer the model to
 *  VERIFY anything likely posterior to its training cutoff (recent events, live/changing
 *  data) by browsing the web instead of answering from stale memory or claiming it can't
 *  know. Only injected when browser tools exist (else it'd promise a tool it lacks).
 *  Wire-safe (no PII). */
const BROWSER_RECENCY_GUIDANCE =
  "\n\n🌐 Tu disposes d'un NAVIGATEUR (outils `browser__…`, dont `browser_navigate` + lecture de page). " +
  "Tes connaissances s'arrêtent à ta date d'entraînement. Dès qu'une demande porte probablement sur quelque " +
  "chose de POSTÉRIEUR à cette date ou qui ÉVOLUE dans le temps — actualité, événement récent, donnée en direct " +
  "(météo, résultat sportif, score, actualité — mais PAS un cours de bourse/ETF : pour ça, `run_python` + `" + PY + "_prices`, jamais le navigateur), « aujourd'hui / en ce moment / actuel / dernier / " +
  "récent / nouvelle version », une année récente, le titulaire ACTUEL d'un poste, la dernière version d'un " +
  "logiciel… — ne réponds PAS de mémoire et n'affirme PAS que tu ne peux pas le savoir : VÉRIFIE avec le " +
  "navigateur (`browser_navigate` vers un moteur de recherche ou le site pertinent, puis lis le résultat), puis " +
  "réponds à partir de ce que tu as trouvé. Si les outils du navigateur ne sont pas encore chargés, appelle " +
  "d'abord `load_tools` avec « browser ». Pour une simple recherche web, reste en lecture (navigation + lecture) " +
  "— n'effectue pas d'action nécessitant une connexion. Comme tu as DÉJÀ le navigateur pour chercher sur le web, " +
  "ne demande JAMAIS à l'utilisateur de connecter un outil de recherche (Tavily, Exa, Firecrawl…) et n'appelle pas " +
  "`suggest_integrations` pour ça : navigue toi-même. Inutile de naviguer pour une connaissance stable et " +
  "intemporelle (définitions, histoire, calculs) : réponds directement.";

/** Appended when the batch web reader (`web_fetch_many`) is available — steers the model
 *  to read several KNOWN URLs in ONE parallel call instead of opening them one by one.
 *  The browser is mentioned ONLY when it is actually offered (un modèle faible imite
 *  sinon un `browser_navigate` textuel qui n'existe pas dans l'offre). */
function webFetchManyGuidance(browserAvailable: boolean): string {
  return (
    "\n\n⚡ Tu disposes de `web_fetch_many` : il récupère le TEXTE de plusieurs pages EN PARALLÈLE (jusqu'à 8 URLs). " +
    "Dès que tu connais DÉJÀ plusieurs URLs à lire (après une recherche qui a listé des liens, pour comparer des sources, " +
    "pour lire 5 fiches en même temps…), appelle `web_fetch_many` avec TOUTES les URLs d'un coup" +
    (browserAvailable
      ? " — ne les ouvre PAS une par une avec le navigateur, c'est bien plus lent. RÉSERVE le navigateur (`browser_navigate`) aux pages qui ont besoin de " +
        "JavaScript (apps rendues côté client) ou d'une INTERACTION (cliquer, remplir un formulaire, faire défiler). " +
        "`web_fetch_many` ne lit que du HTML/texte statique et n'exécute pas de JavaScript ; si une page revient vide, retente-la " +
        "avec le navigateur."
      : ". `web_fetch_many` ne lit que du HTML/texte statique et n'exécute pas de JavaScript ; si une page revient vide (rendue côté " +
        "client), essaie une AUTRE source (autre résultat de recherche, version texte/AMP) — tu n'as pas de navigateur dans cette conversation.")
  );
}

/** Awareness block appended to the guidance when the callable set was PRUNED:
 *  the model sees the full connected surface (catalog) and how to reach a tool
 *  whose schema isn't loaded yet (`load_tools`). */
function awarenessBlock(catalog: string): string {
  return (
    "\n\nVoici TOUS les outils connectés dont tu disposes (awareness). Les schémas de certains ne sont " +
    "pas encore chargés : si tu as besoin d'un outil listé ici mais non disponible à l'appel, appelle " +
    "`load_tools` — avec le NOM DU CONNECTEUR (ex: \"webflow\") pour charger tous ses outils, ou des noms " +
    "d'outils précis — puis appelle l'outil voulu au tour suivant.\n\n" +
    catalog
  );
}


/** Merge the tool-use guidance (+ optional awareness catalog) into the leading
 *  system message (or prepend one), so every provider sees it as a system
 *  instruction. */
export function withToolGuidance(
  messages: ChatMessage[],
  catalog?: string,
  pythonAvailable?: boolean,
  suggestBlock?: string,
  browserAvailable?: boolean,
  fetchManyAvailable?: boolean,
): ChatMessage[] {
  let guidance = catalog ? TOOL_USE_GUIDANCE + awarenessBlock(catalog) : TOOL_USE_GUIDANCE;
  if (pythonAvailable) guidance += pythonGuidance(webToolPhrase(!!browserAvailable, !!fetchManyAvailable));
  if (browserAvailable) guidance += BROWSER_RECENCY_GUIDANCE;
  if (fetchManyAvailable) guidance += webFetchManyGuidance(!!browserAvailable);
  if (suggestBlock) guidance += suggestBlock;
  // DERNIER bloc, toujours — cet append repousse la règle de langue du message système à
  // 7 % du haut (mesuré : ~13 500 caractères d'outillage derrière elle), si bien que ce
  // qu'un petit modèle lit juste avant le tour de l'utilisateur parle du navigateur, pas
  // de la langue. `LANGUAGE_REMINDER` la redit là où la récence porte ; la règle qui fait
  // foi reste `LANGUAGE_GUIDANCE`, dans le même fichier (voir son commentaire).
  guidance += `\n\n${LANGUAGE_REMINDER}`;
  const first = messages[0];
  if (first?.role === "system") {
    return [{ ...first, content: `${first.content}\n\n${guidance}` }, ...messages.slice(1)];
  }
  return [{ role: "system", content: guidance }, ...messages];
}


/**
 * ⛔ Ce qu'on dit au modèle dès le PREMIER échec d'une ÉCRITURE — et pourquoi ce n'est pas
 * la note générique « déjà renvoyé 2 fois » (qui, elle, attend une répétition).
 *
 * Un échec d'écriture NE PROUVE PAS que l'effet n'a pas eu lieu. Outlook a rendu
 * « Unexpected end of JSON input » sur un `202 Accepted` VIDE de Graph — donc sur un mail
 * DÉJÀ PARTI ; la boucle a relancé le même appel, un second mail est parti, et
 * l'utilisateur a été informé que l'envoi avait échoué (18/08). Cette cause-là est corrigée
 * à la racine (`main/mcp/connectors/run.ts`), mais elle reviendra sous une autre forme — un
 * délai dépassé, une coupure après la requête — et un doublon d'envoi ou de paiement ne se
 * rattrape pas. Une LECTURE, elle, se rejoue sans risque : cette note ne vaut que pour les
 * écritures. ⚠️ Ne pas l'ajouter quand le résultat porte déjà `TIMED_OUT_WRITE_RESULT` : il
 * dit la même chose, et `turnCheckpoint` s'appuie sur son égalité EXACTE.
 */
export function withFailedWriteNote(content: string, toolName: string, applies: boolean): string {
  // ⚠️ Jamais quand le résultat PORTE DÉJÀ la consigne : un dispatch dont le délai est
  // dépassé rend `TIMED_OUT_WRITE_RESULT`, qui dit la même chose pour la même raison —
  // et `turnCheckpoint` s'appuie sur l'égalité EXACTE de ce texte.
  if (!applies || content === TIMED_OUT_WRITE_RESULT || content === INTERRUPTED_TOOL_RESULT) {
    return content;
  }
  return (
    content +
    `\n\n(⚠️ \`${toolName}\` est une ÉCRITURE et elle a échoué. Un échec ne prouve PAS que ` +
    `rien ne s'est produit : l'opération a pu aboutir côté service avant l'erreur. Ne relance ` +
    `PAS le même appel — VÉRIFIE d'abord avec un outil de lecture si l'action a eu lieu, ou ` +
    `explique à l'utilisateur ce qui bloque et laisse-le décider.)`
  );
}
