import { isBrowserWriteTool, isWebBrowseTool } from "../state/browserPolicy";
import { classifyToolWrite, isAmbiguousWrite, findConnector } from "@openmasq/catalog/mcp";
import { bareWithoutVendor, COMPOUND_WRITE, DESTRUCTIVE_VERB, READ_VERB } from "./toolVerbs";
import { asksConsultNotAct } from "./readIntent";

// Tool read-vs-write classification for the agentic MCP loop. Pure + unit-tested;
// pulled out of `mcpAgent.ts` so the heuristics live in one small, testable place. Le
// vocabulaire de verbes ET le classifieur écriture vivent dans `@openmasq/catalog/mcp`
// (`writeVocabulary.ts`) — la même liste que le write-gate de main (règle 9).

/** Read-only vs MUTATING heuristic for a tool. A tool is a WRITE (→ user confirmation)
 *  when its bare name (after the `${server}__` prefix) signals a mutation — and when it
 *  signals NOTHING: **unknown ⇒ WRITE** (fail closed, aligned on main's gate; an
 *  un-annotated tool of unknown effect can mutate, so it confirms). A server annotation
 *  may only RAISE suspicion, never lower it; `readOnlyHint:true` and the description are
 *  tie-breakers for a GENERIC name only. The one shared implementation is
 *  `classifyToolWrite` (`@openmasq/catalog/mcp`) — main's `writeGate.ts` calls the SAME
 *  function, so the two boundaries cannot drift apart again. */
export function isWriteTool(
  name: string,
  description?: string,
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean },
): boolean {
  return classifyToolWrite(name, annotations, description);
}

/**
 * La garde « consulter ≠ agir » : cette écriture doit-elle être refusée D'OFFICE parce que
 * le dernier message ne demandait qu'à REGARDER ? (Le refus est déterministe, quel que soit
 * le mode : en `standard` une écriture ordinaire n'ouvre aucune carte tant que la
 * conversation n'a pas touché le web — c'est ainsi qu'une demande de lecture avait créé un
 * vrai événement d'agenda.)
 *
 * Deux exemptions, pour des raisons opposées :
 * - le NAVIGATEUR — lire une page demande couramment de cliquer (cookies, pagination), et
 *   ses écritures ont déjà leurs propres gates ;
 * - l'écriture AMBIGUË — verdict porté par le seul `execute`/`run` contre un
 *   `readOnlyHint:true` déclaré (`execute-sql`). Elle reste une écriture, donc la carte de
 *   confirmation s'ouvre : on ne lève que le refus automatique, qui rendait l'unique outil
 *   capable de répondre inatteignable pour TOUTE demande de lecture (journal du 15/08 —
 *   « regarde l'activité », neuf tours, aucune réponse).
 */
export function refusedAsConsultOnly(
  name: string,
  isWrite: boolean,
  lastUserText: string,
  info?: { description?: string; annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean } },
): boolean {
  if (!isWrite || isWebBrowseTool(name)) return false;
  if (isAmbiguousWrite(name, info?.annotations, info?.description)) return false;
  return asksConsultNotAct(lastUserText);
}

/** CONFIDENTLY read-only ⇒ safe to PRE-FETCH / run in PARALLEL without the write gate.
 *  Requires POSITIVE read evidence — a declared `readOnlyHint`, or a read-verb NAME. An
 *  UNKNOWN-intent tool (neither clearly read nor write, e.g. `execute_sql`, a bare
 *  `customers`) is NOT confident-read-only, so it is never eagerly executed before the
 *  loop can gate it (`isWriteTool` is a heuristic that can MISS a mutation — the prefetch
 *  must not amplify that miss into an unconfirmed side effect). Pure + unit-tested. */
export function isConfidentReadOnly(
  name: string,
  info?: { annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean } },
): boolean {
  const a = info?.annotations;
  // A destructive / non-read-only declaration rules the prefetch out immediately.
  if (a?.destructiveHint === true || a?.readOnlyHint === false) return false;
  // FIRST `__` = the connector boundary (the client stamps one prefix), matching
  // `isWriteTool` — `lastIndexOf` would drop part of a bare name containing `__`.
  const i = name.indexOf("__");
  const bare = (i >= 0 ? name.slice(i + 2) : name).replace(/[_-]+/g, " ");
  // A destructive verb anywhere, OR a conjunction-joined compound write, disqualifies the
  // prefetch even behind a read prefix (H-5): `get_and_purge` / `get_and_send_email` must
  // never be eagerly executed with real args.
  if (DESTRUCTIVE_VERB.test(bare) || COMPOUND_WRITE.test(bare)) return false;
  // ⚠️ **Un outil de NAVIGATION n'est jamais « parallélisable en confiance »**, même quand
  // il ne fait que lire. Le navigateur intégré est UN onglet et CDP est global au
  // processus : deux `snapshot` concurrents autour d'une navigation ne décrivent aucune
  // page en particulier, et « émets-les ensemble » est un mauvais conseil pour la même
  // raison. Il était exclu par ACCIDENT de nommage (`browser_snapshot` ne commence pas par
  // un verbe de lecture) — un accident que `bareWithoutVendor` supprime justement, et qui
  // laissait déjà passer un `get_page` d'un navigateur tiers. Exclusion explicite, donc.
  if (isWebBrowseTool(name)) return false;
  // Require a POSITIVE read-verb NAME to eagerly execute before the write gate. A bare
  // server `readOnlyHint:true` is NOT enough (audit H-5): a spoofed hint would pre-run
  // a mutation before any confirmation. The name is the trust anchor for the prefetch.
  // Le nom du vendeur, quand il se répète, n'est pas la commande — voir `bareWithoutVendor`.
  return READ_VERB.test(bareWithoutVendor(name).replace(/[_-]+/g, " "));
}

/** True when a tool belongs to a PUBLIC web-search / crawl connector (Firecrawl /
 *  Exa / Tavily — catalog `category:"search"`). Their results are whole web pages
 *  whose embedded image/file URLs are page DECORATION, not user exports — so we must
 *  NOT fetch + save them to the library (a single search flooded it with a dozen
 *  worthless scraped marketing images). Keyed off the tool-name connector prefix
 *  (`firecrawl__firecrawl_scrape` → "firecrawl"), like the redaction policy. */
export function isSearchTool(toolName: string): boolean {
  const px = toolName.indexOf("__");
  const connectorId = px > 0 ? toolName.slice(0, px) : toolName;
  // The integrated agent-browser AND any THIRD-PARTY browser-automation connector
  // (BrowserMCP…) read/search PUBLIC web pages — treat them like a search connector:
  // their page places/orgs are content, embedded image URLs are decoration. Keyed off
  // the `browser_*` tool-name convention (isWebBrowseTool), so the 🌐 reveal gate fires
  // even for a third-party browser (which our `connectorId === "browser"` check missed).
  //
  // ⚠️ SAFE to key off the NAME here because every use of this predicate makes the app
  // do MORE for the user (ask about revealing, treat page text as public content). Never
  // use it to SKIP a security check — see `skipsArgExfilScan`.
  return isWebBrowseTool(toolName) || findConnector(connectorId)?.category === "search";
}

// ── « Rédige un email » ≠ « envoie un email » ─────────────────────────────────
/** Send-class COMMUNICATION tools (bare name): dispatching one TRANSMITS a message to
 *  a real recipient — the irreversible half of « rédige-moi un email ». Verb-prefix
 *  match (send_email, send_message, reply_to_thread, post_message…); a DRAFTING tool
 *  (create_draft…) is deliberately NOT send-class. */
export function isCommSendTool(bareToolName: string): boolean {
  return /^(send|reply|post)[_-]/i.test(bareToolName);
}

// JS `\b` is ASCII-only — it fails before an ACCENTED initial (« Écris un mail » never
// matched), so word edges are asserted with accent-aware lookarounds instead.
const DRAFT_VERB_RE =
  /(?<![a-zà-ÿ])(r[ée]dige[rz]?|[ée]cri(s|re|vez)|pr[ée]pare[rz]?|compose[rz]?|drafte?|write|draft|prepare)(?![a-zà-ÿ])/i;
const SEND_VERB_RE =
  /(?<![a-zà-ÿ])(envoie[sz]?|envoyer|envoyez|transmet(s|tez)?|transmettre|exp[ée]die[rz]?|r[ée]pond(s|re|ez)|send|forward|poste[rz]?|publie[rz]?)(?![a-zà-ÿ])/i;
const COMM_NOUN_RE =
  /(?<![a-zà-ÿ])(e-?mails?|mails?|courriels?|messages?|courriers?|brouillons?|r[ée]ponses?|sms|dm)(?![a-zà-ÿ])/i;

/** True when the user's LAST message asks to DRAFT a communication (rédige/écris/
 *  prépare un email, un message…) with NO explicit send verb. A weak model routinely
 *  jumps straight to `send_email` on that ask (journal 2026-07-26 : « Rédige un email
 *  de remerciement à X » parti sur-le-champ) ; the loop then refuses the send-class
 *  call DETERMINISTICALLY and steers to a draft in the conversation — sending happens
 *  on an explicit follow-up (« envoie-le »), which carries a send verb and re-opens
 *  the gate. A send-verb false positive only restores the old behaviour (fail toward
 *  dispatch + the normal write gates), never over-blocks. */
export function isDraftOnlyIntent(lastUserText: string): boolean {
  const t = lastUserText || "";
  return COMM_NOUN_RE.test(t) && DRAFT_VERB_RE.test(t) && !SEND_VERB_RE.test(t);
}

/**
 * May this call skip the ARG-EXFIL scan? Only a tool we can positively attribute to the
 * integrated browser or to a catalog connector the CATALOG classifies as `search` — i.e.
 * a governable list we control, never the tool's own name.
 *
 * ⚠️ This is deliberately NOT `isSearchTool`. That predicate accepts any bare name
 * starting with `browser_`, so a hostile or compromised MCP server naming its tool
 * `evil__browser_navigate` self-classified as a search tool and **skipped the scan** —
 * naming conferring capability, which is fail-open by construction. The skip exists only
 * to avoid double-prompting on a call the reveal gate already covers; anything we cannot
 * attribute gets scanned. Pinned by `toolExfilScan.test.ts`.
 */
export function skipsArgExfilScan(toolName: string): boolean {
  const px = toolName.indexOf("__");
  const connectorId = px > 0 ? toolName.slice(0, px) : toolName;
  if (connectorId === "browser") return true; // the integrated browser we ship
  return findConnector(connectorId)?.category === "search"; // a catalog-governed connector
}

/**
 * May this tool's RESULTS enter the browser CLEAR-MODE (dynamic redaction: a call
 * that touches no redacted data gets replay-only results and no reveal card)?
 * Same attribution bar as {@link skipsArgExfilScan}, for the same reason: clear-mode
 * REMOVES a protection, so it is granted only to a tool positively attributed to the
 * integrated browser or a catalog-governed `search` connector — never to a
 * name-derived classification (a hostile `evil__browser_x` must not self-classify
 * into unredacted results). Deliberately NOT `isSearchTool`.
 */
export function isGovernedWebTool(toolName: string): boolean {
  // `web_fetch_many` is OUR intercepted batch reader (never proxied — the loop handles
  // the name before any server sees it, so a hostile server cannot self-classify into
  // it), fetching public pages over plain HTTP with no cookies/auth. Same positive
  // attribution as the integrated browser — and the SAME clear-mode rationale: a
  // data-free fetch of a public page fully redacted turned Le Monde's front page into
  // 100+ minted fakes (Lagarde, Trump…) and a distorted answer.
  return toolName === "web_fetch_many" || skipsArgExfilScan(toolName);
}

// ── Per-tool call cap: CHERCHER n'est pas MARTELER ───────────────────────────
/**
 * Combien de fois le MÊME outil peut être appelé dans UN tour avant le garde-fou
 * aveugle-à-la-productivité (`MAX_SAME_TOOL` côté boucle).
 *
 * Le plafond plat mesurait un martèlement d'API (`execute_sql` / `run_python` /
 * `posthog__exec` à 9–15× sur les modèles faibles) — mais une RECHERCHE sur le web
 * est itérative par nature : une requête, trois pages qui ne répondent pas, une
 * requête plus précise, la page équipe. Chacun de ces appels est « productif » au
 * sens de la boucle (nouvelle URL, nouveau contenu), donc ni `STUCK_STOP` ni
 * `MAX_CONSECUTIVE_DEAD` ne se déclenchent : seul le plafond par outil coupait — et
 * il coupait au moment où le modèle venait de trouver l'organisation et ouvrait sa
 * page équipe (journal du 27/07). Un utilisateur lit ça comme une panne, alors que
 * le parcours était exactement le bon.
 *
 * Même raisonnement pour une LECTURE tout court (`readOnly` = annotation serveur
 * `readOnlyHint`, cf. `isConfidentReadOnly`) : dépouiller une boîte mail, c'est UN
 * `search_messages` puis N `get_message`, et N vaut ce que vaut la boîte. Le plafond
 * plat en refusait 12 sur 20 (journal du 03/08) — l'utilisateur lit « la revue s'arrête
 * au milieu », alors que les 20 lectures partaient EN PARALLÈLE dans le prefetch, en un
 * seul aller-retour de chat. Ce qui borne réellement un batch de lectures n'est pas leur
 * NOMBRE mais la place que leurs résultats prennent dans la fenêtre du modèle, et c'est
 * le budget de caractères côté boucle (`resultCharBudget`) qui le dit.
 *
 * ⚠️ Le relèvement ne vaut QUE pour une lecture : un outil sans annotation, ou qui
 * écrit, garde `MAX_SAME_TOOL`. C'est l'écriture martelée que ce garde-fou existe pour
 * arrêter, et une annotation absente se lit comme « peut écrire » (fail-closed).
 *
 * ⚠️ Le plafond relevé va aux LECTURES web POSITIVEMENT ATTRIBUÉES uniquement
 * (`isGovernedWebTool` : notre navigateur intégré, un connecteur catalogué `search`,
 * notre `web_fetch_many` intercepté) — jamais un nom (`evil__browser_navigate` garde
 * le plafond ordinaire) — et JAMAIS aux primitives d'ACTION du navigateur
 * (clic/saisie/formulaire) : un modèle qui martèle `browser_click` est précisément
 * l'emballement que ce garde-fou existe pour arrêter. Les deux autres gardes
 * restent en place : un butinage stérile est toujours coupé à 5 appels non
 * productifs d'affilée.
 */
export const MAX_SAME_TOOL = 8;
export const MAX_SAME_WEB_READ = 20;
/** Lecture positivement annotée : bornée par le CONTEXTE, pas par le compte. */
export const MAX_SAME_READ = 30;

export function maxSameToolCalls(toolName: string, readOnly = false): number {
  if (isGovernedWebTool(toolName) && !isBrowserWriteTool(toolName)) return MAX_SAME_WEB_READ;
  return readOnly ? MAX_SAME_READ : MAX_SAME_TOOL;
}

// Signals that a request needs CURRENT / web information — news, live data, "today",
// a recent year, an explicit "look it up / go to <site>". Accent-insensitive, FR + EN.
// Word-boundary-ish so "aujourd'hui" matches but a substring inside a longer word
// doesn't fire spuriously (`\bnow\b` not `known`). Kept deliberately BROAD: a false
// positive only OFFERS the browser tool (cheap — two schemas), it never forces a call,
// so leaning toward availability is the safe bias.
const WEB_INTENT_RE = new RegExp(
  [
    // current-events / recency (FR)
    "actualit", "\\bnews\\b", "aujourd'?hui", "en ce moment", "\\br[ée]cent", "derni[eè]r",
    "\\bactuel", "\\bmaintenant\\b", "\\ba jour\\b", "\\bà jour\\b", "en direct", "\\blive\\b",
    "\\bm[ée]t[ée]o\\b", "tendance", "\\bce (matin|soir|week-?end)\\b",
    // current-events / recency (EN)
    "\\btoday\\b", "\\blatest\\b", "\\brecent", "\\bcurrent", "\\bnow\\b", "\\bweather\\b",
    "this (week|month|year|morning|evening)", "up[- ]?to[- ]?date", "right now", "\\bwho is\\b",
    // explicit browse / lookup
    "cherche[rz]? (sur|dans) (le web|internet|google)", "recherche web", "sur (le web|internet)",
    "navigue", "va sur (le site|https?)", "ouvre (le site|la page)", "\\bbrowse\\b",
    "search (the web|online|google)", "look (it|this|that) up", "google\\b",
    // « fais des recherches sur X » — la formulation la PLUS explicite d'une demande de
    // recherche, et elle ne déclenchait rien : le navigateur n'était pas offert, le modèle
    // a deviné un nom d'outil et la boucle a mal attribué le connecteur (journal du
    // 27/07/2026). Un faux positif ne coûte que deux schémas offerts.
    "fai(s|t|tes)[- ]?(moi)?[ ]?(des|une)[ ]recherches?", "recherches? sur\\b",
    "renseigne[- ]?toi", "renseignez[- ]?vous", "documente[- ]?toi", "\\bfind out\\b",
    "research\\b", "look up\\b",
    // a recent/again-changing year (2024+) usually implies live info
    "\\b20(2[4-9]|[3-9]\\d)\\b",
  ].join("|"),
  "i",
);

/** True when the user's request likely needs CURRENT web information — used to keep the
 *  web-browse ENTRY tools directly callable through tool routing so a mid-tier model
 *  doesn't have to chain `load_tools("browser") → browser_navigate` first (the observed
 *  failure: a weak model narrates "I'll browse" but never issues the two-step call). */
export function looksWebIntent(text: string): boolean {
  return !!text && WEB_INTENT_RE.test(text);
}


// Les gardes de COMPORTEMENT vivent dans leurs propres fichiers (règle 1) — réexportées
// ici pour que les importateurs n'apprennent jamais que le découpage a eu lieu.
export { isSendTool, asksDraftNotSend, DRAFT_NOT_SEND_STEER } from "./sendIntent";
export { asksConsultNotAct, CONSULT_NOT_ACT_STEER } from "./readIntent";
