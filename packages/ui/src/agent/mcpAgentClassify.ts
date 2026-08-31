import { isBrowserWriteTool, isWebBrowseTool } from "../state/browserPolicy";
import { classifyToolWrite, isAmbiguousWrite, findConnector } from "@openmasq/catalog/mcp";
import { bareWithoutVendor, COMPOUND_WRITE, DESTRUCTIVE_VERB, READ_VERB } from "./toolVerbs";
import { asksConsultNotAct } from "./readIntent";

// Tool read-vs-write classification for the agentic MCP loop. Pure + unit-tested;
// pulled out of `mcpAgent.ts` so the heuristics live in one small, testable place. The
// verb vocabulary AND the write classifier both live in `@openmasq/catalog/mcp`
// (`writeVocabulary.ts`) — the same list main's write-gate uses (rule 9).

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
 * The "consult ≠ act" guard: must this write be refused OUTRIGHT because the last
 * message only asked to LOOK? (The refusal is deterministic whatever the mode: in
 * `standard` an ordinary write opens no card at all as long as the conversation hasn't
 * touched the web — that's how a read request had created a real calendar event.)
 *
 * Two exemptions, for opposite reasons:
 * - the BROWSER — reading a page commonly requires clicking (cookies, pagination), and
 *   its writes already have their own gates;
 * - an AMBIGUOUS write — a verdict carried by `execute`/`run` alone against a declared
 *   `readOnlyHint:true` (`execute-sql`). It stays a write, so the confirmation card still
 *   opens: we only lift the automatic refusal, which made the one tool able to answer
 *   unreachable for ANY read request (journal 15/08 — "look at the activity", nine
 *   turns, no answer).
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
  // ⚠️ **A NAVIGATION tool is never "confidently parallelisable"**, even when it only
  // reads. The integrated browser is ONE tab and CDP is process-global: two concurrent
  // `snapshot`s around a navigation describe no page in particular, and "emit them
  // together" is bad advice for the same reason. It used to be excluded by a naming
  // ACCIDENT (`browser_snapshot` doesn't start with a read verb) — an accident that
  // `bareWithoutVendor` precisely removes, and which already let a third-party
  // browser's `get_page` through. Hence an explicit exclusion.
  if (isWebBrowseTool(name)) return false;
  // Require a POSITIVE read-verb NAME to eagerly execute before the write gate. A bare
  // server `readOnlyHint:true` is NOT enough (audit H-5): a spoofed hint would pre-run
  // a mutation before any confirmation. The name is the trust anchor for the prefetch.
  // The vendor's own name, when it repeats itself, is not the verb — see `bareWithoutVendor`.
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

// ── "Draft an email" ≠ "send an email" ─────────────────────────────────
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

// ── Per-tool call cap: SEARCHING is not HAMMERING ───────────────────────────
/**
 * How many times the SAME tool may be called in ONE turn before the
 * productivity-blind backstop kicks in (`MAX_SAME_TOOL` on the loop side).
 *
 * The flat cap measured API hammering (`execute_sql` / `run_python` /
 * `posthog__exec` at 9–15× on weak models) — but a web SEARCH is iterative by
 * nature: one query, three pages that don't answer, a more precise query, the team
 * page. Each of these calls is "productive" in the loop's sense (new URL, new
 * content), so neither `STUCK_STOP` nor `MAX_CONSECUTIVE_DEAD` fires: only the
 * per-tool cap cut — and it cut right as the model had just found the organisation
 * and was opening its team page (journal 27/07). A user reads that as a failure,
 * when the path taken was exactly the right one.
 *
 * Same reasoning for a plain READ (`readOnly` = server annotation `readOnlyHint`,
 * cf. `isConfidentReadOnly`): clearing out a mailbox is ONE `search_messages` then N
 * `get_message`, and N is whatever the mailbox holds. The flat cap refused 12 out of
 * 20 (journal 03/08) — the user reads "the review stops halfway", when the 20 reads
 * were going out IN PARALLEL in the prefetch, in a single chat round trip. What
 * actually bounds a read batch isn't their COUNT but the room their results take up
 * in the model's context window, and that's what the loop's char budget
 * (`resultCharBudget`) says.
 *
 * ⚠️ The raised cap applies ONLY to a read: a tool with no annotation, or that
 * writes, keeps `MAX_SAME_TOOL`. It's hammered WRITES this backstop exists to stop,
 * and a missing annotation reads as "can write" (fail-closed).
 *
 * ⚠️ The raised cap goes to POSITIVELY ATTRIBUTED web READS only
 * (`isGovernedWebTool`: our integrated browser, a catalog `search` connector, our
 * intercepted `web_fetch_many`) — never a name (`evil__browser_navigate` keeps the
 * ordinary cap) — and NEVER to the browser's ACTION primitives (click/type/submit): a
 * model hammering `browser_click` is exactly the runaway this backstop exists to stop.
 * The other two guards still apply: sterile foraging is always cut at 5 non-productive
 * calls in a row.
 */
export const MAX_SAME_TOOL = 8;
export const MAX_SAME_WEB_READ = 20;
/** A positively-annotated read: bounded by CONTEXT, not by count. */
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
    // "fais des recherches sur X" (do some research on X) — the MOST explicit
    // phrasing of a search request, and it triggered nothing: the browser wasn't
    // offered, the model guessed a tool name and the loop mis-attributed the
    // connector (journal 27/07/2026). A false positive only costs two offered schemas.
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


// The BEHAVIOUR guards live in their own files (rule 1) — re-exported here so
// importers never learn that the split happened.
export { isSendTool, asksDraftNotSend, DRAFT_NOT_SEND_STEER } from "./sendIntent";
export { asksConsultNotAct, CONSULT_NOT_ACT_STEER } from "./readIntent";
