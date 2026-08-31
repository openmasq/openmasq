import { BRAND } from "@openmasq/branding";
import { contextWindow, type ChatMessage, type ProviderId, type TokenUsage, type ToolDef } from "@openmasq/llm";
import { routeTools, needsRouting, routerCooldownActive, noteRouterFailure, noteRouterSuccess, RouterUnreadableError } from "./toolRouter";
import {
  toolDefOf,
  estToolTokens,
  fitToBudget,
  toolCatalog,
  canonicalToolName,
  LOAD_TOOLS_DEF,
  resolveLoadTools,
  argErrorHint,
  unknownToolHint,
} from "./toolCatalog";
import type { RoutingConfig, CatalogConfig } from "./routingConfig";
import { contextBudgetNote, prefetchReads, resultCharBudget, toolResultChars } from "./prefetch";
import { rescueEntryTools } from "./entryTools";
import { sanitizeToolSchemas } from "./schemaSanity";
import { rescueScopedConnectors, rescueNamedConnectors } from "./connectorRescue";
import { schemaBlindProblems } from "./schemaBlind";
import { resolveOperation, normalizeAction } from "./operationResolver";
import { toolStartNarration } from "./toolActionLabel";
import { isBrowserWriteTool, isBrowserTool, isWebBrowseTool, domainAllowed, analyzeNavExfil, analyzeArgExfil, navCarriesRedactedData, navCarriesOfferableData, browserNavUrl, type NavExfilFlag } from "../state/browserPolicy";
import { WEBNAV_OFFER_KEYS } from "../state/webNavReveal";
import { fakeDerivedNavHost } from "../state/browserNavFake";
import { connectorIdFromInstance, findConnector } from "@openmasq/catalog/mcp";
import { isConnectorAllowed } from "../privacy/orgAllowList";
import {
  connectorIdsFromTools,
  notConnectedConnectors,
  connectedConnectors,
  suggestGuidance,
  suggestIntegrationsDef,
  MAX_SUGGESTIONS,
  resolveSuggestCall,
} from "./suggestIntegrations";
import {
  RedactingMcpClient,
  resultText,
  type McpConnection,
  type McpTool,
  type McpToolCall,
  type Vault,
} from "@openmasq/mcp";
import type { Host, WebFetchItem } from "../host";
import { captureEvent, type ToolErrorReason, type SendErrorReason } from "../analytics";
import {
  isWriteTool,
  refusedAsConsultOnly,
  isConfidentReadOnly,
  isCommSendTool,
  isDraftOnlyIntent,
  isSearchTool,
  isGovernedWebTool,
  skipsArgExfilScan,
  maxSameToolCalls,
} from "./mcpAgentClassify";
import { missingRequired, attributeToolFault, classifyToolError, classifyErrorFamily } from "./toolFault";
import { makeStruggleReporter, type ToolStruggle } from "./toolStruggle";
import { connectorsForRequest, scopePreflight, missingConnectorMessage } from "./integrationMatch";
import { advanceSoloRead, shouldNudgeBatch, batchReadNudge, type SoloReadStreak } from "./batchReads";
import { makeNavClearRedactor } from "./navClearRedact";
import { writeKey } from "./writeIdempotency";
import { ResultEchoLedger } from "./resultEcho";
import { makeCoalescingRedactor } from "./redactCoalesce";
import { recordWebSearch } from "./confirmationFacts";
// Re-exported so existing importers (`store.ts`, `mcpAgent.test.ts`) keep importing
// the tool-classification helpers from `./mcpAgent` unchanged after the extraction.
export { isWriteTool, isConfidentReadOnly, isSearchTool, looksWebIntent } from "./mcpAgentClassify";
export { classifyToolError } from "./toolFault";
export { writeKey } from "./writeIdempotency";
import {
  withToolGuidance,
  looksLikeRefusal,
  exhaustionMessage,
  capRefusalNote,
  confirmActLabel,
  pythonErrorHint,
  pythonFailReason,
  BROWSER_ENABLE_HINT,
  isBrowserBackendFault,
  BROWSER_BACKEND_FAULT_MESSAGE,
  repeatedFailureOf,
  opaqueIdsIn,
  identifierTypoHint,
  withFailedWriteNote,
} from "./mcpAgentGuidance";
// `exhaustionMessage`/`pythonErrorHint` are re-exported for `mcpAgent.test.ts`.
export { exhaustionMessage, pythonErrorHint } from "./mcpAgentGuidance";
import { namesConnectedConnector } from "./mcpAgentOutcome";
import { safeJson, deredactArgs, compactToolHistory } from "./mcpAgentUtil";
import { turnRequestDelta, turnRequestFull, turnToolNames, turnToolCall } from "./turnDebug";
import { unredactArgs, redactionCategory } from "@openmasq/redact";
import { isAbortError, raceAbort } from "./mcpAgentAbort";
import { toolTimeoutMs, watchToolCall, liveToolStatus, ToolTimeoutError } from "./mcpAgentWatchdog";
import { INTERRUPTED_TOOL_RESULT, TIMED_OUT_WRITE_RESULT } from "./turnCheckpoint";
import { matchesAttachmentName } from "../send/sendGuards";
import { typedPartOfWire } from "../send/foldPayload";

export type { ToolStruggle };

/** WHY the confirm card opened. The card used to assume `write` and told the user the
 *  model wanted to "créer, modifier ou supprimer des données" — false for the other
 *  three, and actively misleading for a navigation (which is a page READ, and is
 *  EXEMPT from the write gate: it confirms only on an exfil signal). The loop knows the
 *  reason; it must say so rather than let the card guess.
 *  - `write`: `isWriteTool` flagged a genuinely mutating call.
 *  - `nav-exfil`: a navigation whose URL carries real conversation data / an encoded blob.
 *  - `attachments`: real user files leave with the call (audit M1).
 *  There is deliberately NO read-args reason: a read dispatches without asking (H-4 now
 *  traces instead of blocking) — see the `needsConfirm = false` branch. */
export type WriteConfirmReason = "write" | "nav-exfil" | "attachments";

/** What the loop hands the confirm card. `args` are DISPLAY values — un-redacted with
 *  the SAME policy the wire uses (see the `confirmWrite` call site), so what the user
 *  reads is what the tool receives. `flags` are computed by the loop, never re-derived
 *  by the card: the card sees a different vault view and would disagree. */
export interface WriteConfirmInfo {
  tool: string;
  server: string;
  args: Record<string, unknown>;
  /** For an email send: the REAL filenames that resolved from the model's requested
   *  attachments (audit M1). Surfaced in the confirm card so the user sees exactly
   *  which of their own files will leave — the model only ever named them. */
  attachments?: string[];
  reason: WriteConfirmReason;
  /** The exfil signals that OPENED the card (empty for a plain write). */
  flags: NavExfilFlag[];
}

import { pushDebug, updateDebug, isDebugCapture } from "../state/debug";
import { RUN_PYTHON_DEF, MEMORY_SEARCH_DEF, WEB_FETCH_MANY_DEF, INTERCEPTED_META_TOOLS } from "./interceptedTools";
import { summarizeToolResult } from "./toolResultSummary";
export { summarizeToolResult }; // re-export: the trace tests import from here
import { sendErrorReason } from "../state/errors";


export interface McpAgentParams {
  host: Host;
  provider: ProviderId;
  modelId: string;
  apiKey?: string;
  baseUrl?: string;
  /** The redacted (wire-form) conversation so far — the model only sees placeholders. */
  history: ChatMessage[];
  /** Shared conversation vault. Mutated in place as tool results reveal new secrets. */
  vault: Vault;
  /** value → kind map (original → category), so the Debug Log can colour the
   *  redacted↔original mapping for tool args/results. Optional. */
  kinds?: Record<string, string>;
  secrets: string[];
  disabledKinds: string[];
  /** The domains of CONNECTED integrations (`send/redactKeep.ts` `connectedUrlHosts`):
   *  the sub-parts of a link pointing to one of them stay in clear, including
   *  on the clear-mode path. Absent ⇒ no exemption. */
  structuralUrlHosts?: string[];
  /** MCP connector ids the org disallows: their tools are stripped from this turn
   *  so a member can't invoke a blocked connector even if it's already connected.
   *  Ids are catalog ids (`gmail`, `notion`, `filesystem`); a live server's id may
   *  carry a `broker-`/`local-` prefix, which is normalised away before matching. */
  /** Connector allow-list; `undefined` = no organization. */
  allowedServerIds?: string[];
  /** Agent-browser hardening (prompt-injection damage limiters):
   *  - `browserReadOnly` strips the browser's interaction/mutation tools (click/
   *    type/submit…) so an injected page can't make the model ACT — only navigate +
   *    read (a "recherche = lecture seule" mode).
   *  - `browserAllowedDomains` bounds where the model may NAVIGATE (empty =
   *    unrestricted; the human URL bar is unaffected). */
  browserReadOnly?: boolean;
  browserAllowedDomains?: string[];
  /** The connectors the user has SCOPED this send to (`Workflow.servers`).
   *  Routing guarantees their tools stay callable even when the router — a
   *  model call, hence fallible — didn't keep them. This is a WIDENING of
   *  the offer, never a restriction: the write gates and the rest of the catalog
   *  stay unchanged (a scoped workflow can still call another connector). */
  scopedConnectors?: string[];
  /** The app HAS a built-in web browser that can be enabled (`host.mcp.enableBrowser`),
   *  even if it isn't connected right now. When true, the loop never suggests a paid
   *  third-party search connector (Exa/Tavily/Firecrawl) for a web-search need — it steers
   *  the user to enable the free built-in browser instead. */
  browserEnableable?: boolean;
  /**
   * How a tool RESULT is redacted before the model sees it. Pass the model-engine
   * `pseudonymize` (names/orgs/odd-format phones) when the user runs the model
   * redaction engine; omit to fall back to the client's default regex `redact`.
   * The optional 3rd arg is the namespaced tool name (`${connector}__${tool}`), so
   * a connector-specific policy can apply — e.g. a PUBLIC web-search connector's
   * results keep place/organisation names in clear (they're the answer's substance,
   * not private data), while personal identifiers stay redacted.
   * `many` (a `ToolResultRedactor`) redacts N same-tool results in ONE engine pass —
   * the coalescer (`redactCoalesce.ts`) feeds it a parallel read wave's queue.
   */
  redactResult?: ((text: string, vault: Vault, tool?: string) => string | Promise<string>) & {
    many?: (texts: string[], vault: Vault, tool?: string) => Promise<string[]>;
  };
  /** Restore placeholders for display (the store's `fromWire`). */
  fromWire: (s: string) => string;
  /** URL/args-AWARE restore for the write-confirmation DISPLAY of tool-call args: a fake
   *  dropped into a URL query is `+`/`%20`-encoded ("q=Norvik+Group"), which the plain
   *  `fromWire` (space-only) leaves as the FAKE — so the dialog showed a redacted value
   *  under a "valeurs RÉELLES" label. This restores the encoded forms too, matching what
   *  the RedactingMcpClient actually sends. Falls back to `fromWire` when absent. */
  fromWireArgs?: (s: string) => string;
  /** Update the assistant bubble (already de-redacted text). */
  onText: (content: string, pending: boolean) => void;
  /** The tool currently being called (its name), or `null` once done — drives
   *  the animated "Appel de l'outil…" indicator in the assistant bubble. */
  onToolCall: (name: string | null) => void;
  /** A tool call FINISHED (success or error): appended to the assistant message's
   *  persisted `toolCalls` so the workflow trace survives a reload. `server` is the
   *  connector id, `tool` the bare name, `summary` a short redacted result blurb,
   *  `note` the optional human narration from {@link summarizeToolCall}. */
  onToolResult?: (r: { tool: string; server: string; ok: boolean; declined?: boolean; summary?: string; note?: string; ms?: number }) => void;
  /** Turn a tool call into ONE short human-readable line ("Recherche d'actualités
   *  françaises"), for the live bubble status + the persisted trace. Called at the
   *  dispatch site with the WIRE (redacted) args — so it stays wire-safe — and run in
   *  PARALLEL with the round-trip (never blocks it). Absent ⇒ no narration (the
   *  template label still shows). Must resolve to "" on failure/timeout, never reject. */
  summarizeToolCall?: (info: {
    tool: string;
    server: string;
    args: Record<string, unknown>;
  }) => Promise<string>;
  /** The narration for the in-flight tool resolved → update the live bubble status.
   *  Fires only while the call is still running (a summary that lands after the tool
   *  finished is dropped from the live line but may still be persisted via onToolResult). */
  onToolProgress?: (text: string) => void;
  /** The FIRST sign of generation from a model call this turn — the first streamed
   *  prose chunk OR the first tool-call argument. Lets the store mark time-to-first-
   *  token even for a TOOL-FIRST turn (no prose). Fires once per model call. */
  onFirstToken?: () => void;
  /** Running char-count of the tool-call ARGUMENTS the model is currently streaming + the
   *  tool NAME (a big `run_python` / `write_file` body streams for seconds with NO prose).
   *  Lets the bubble's "thinking" indicator show the CONCRETE action in progress instead
   *  of a frozen loader. */
  onToolArgs?: (chars: number, name?: string) => void;
  /** A delta of the model's live REFLECTION (reasoning models only), WIRE-form like
   *  `onText` — the caller un-redacts it. Shown in place of the loader. */
  onReasoning?: (delta: string) => void;
  /** Total token usage for the turn (summed across the agentic loop's calls), plus
   *  `toolCount` = the number of connected MCP tools offered this turn (the "298" in
   *  "0/298 outils") — the knob that drives a huge prefill/TTFT, for the latency event. */
  onUsage?: (usage: TokenUsage & { toolCount: number; modelTurns: number }) => void;
  /** The provider's REMAINING request quota — announced while there is room to act. */
  onQuotaLeft?: (left: { remaining: number; limit?: number; resetAt?: number }) => void;
  /** A tool the model kept malforming without recovering → surface a "this model
   *  is likely too limited for this tool" hint. Fired at most once per turn. */
  onToolStruggle?: (info: ToolStruggle) => void;
  /** The model called `suggest_integrations` because it can't fulfil the request
   *  without an integration that isn't connected (e.g. "send an email" with no Gmail).
   *  `ids` are `@openmasq/catalog/mcp` connector ids (validated against the
   *  not-connected set); the store pins them on the assistant message so the bubble
   *  renders clickable "connect this integration" cards. Fired at most once per turn. */
  onSuggestIntegrations?: (ids: string[]) => void;
  /** Renderer-side abort: checked between the loop's model calls / tool calls so
   *  Stop halts the agentic turn without waiting for the turn cap. */
  signal?: AbortSignal;
  /** Correlates the model calls so the store's Stop can abort the in-flight
   *  provider fetch in main (paired with `host.cancelTools(requestId)`). */
  requestId?: string;
  /** The conversation this turn runs for — stamps every Debug-Log entry so the
   *  journal is scoped per conversation (concurrent per-tab turns stay separate). */
  convId?: string;
  /** Idempotency (retry-safety, Option A). The stable id of the TURN this send belongs
   *  to; a retry reuses it (the store threads `resendTurnId`). A side-effecting call is
   *  keyed on (turnId, tool, WIRE args) — see `writeIdempotency.ts`. Absent ⇒ no guard. */
  turnId?: string;
  /** Has this exact side-effecting call already completed in this turn (or a prior
   *  attempt of it)? The store checks its per-conversation ledger. True ⇒ the loop SKIPS
   *  the real dispatch AND its confirm, and tells the model it is already done. */
  writeLedgerHas?: (key: string) => boolean;
  /** Record a side-effecting call as COMPLETED (so a retry won't repeat it). Called only
   *  after the write returns WITHOUT error — a failed/declined write is never recorded. */
  onWriteDone?: (key: string) => void;
  /** RESUME (Option B): the wire transcript of a PRIOR, failed attempt of this turn — the
   *  assistant tool-call turns + their (redacted) results. Seeded after `history` so the
   *  model CONTINUES from where it stopped (it sees the reads/writes already done and only
   *  finishes the unfinished step) instead of re-running the whole turn. Empty/absent ⇒ a
   *  normal fresh turn. Pairs with Option A: a write the transcript shows as done is never
   *  re-issued, and if the model re-issues one anyway the idempotency ledger still blocks it. */
  resumeTranscript?: ChatMessage[];
  /** Checkpoint the FULL accumulated tool-turn transcript (wire form) so a retry can resume
   *  from it. Fired at the end of each agentic turn (a valid tool_use↔tool_result boundary),
   *  so whatever ends the turn leaves the latest replayable state. The store keeps it keyed
   *  by `turnId`. Never carries un-redacted data — it is exactly what the model saw. */
  onResumeTranscript?: (transcript: ChatMessage[]) => void;
  /** A downloadable file URL found in a tool result (e.g. a Canva export link):
   *  the URL was already stripped from the model-facing text; the host fetches +
   *  stores + displays the real file to the user. */
  onExportedFile?: (url: string, mimeType: string) => Promise<void> | void;
  /** Ask the USER to approve a tool call BEFORE it runs, so the model can't silently
   *  create/update/delete real data — e.g. GLM-5.2 falling back to a CREATE op for an
   *  update, which made Stripe mint a DUPLICATE customer. Resolves true = run, false =
   *  skip (fed back to the model). Absent = no gate (unchanged). See {@link
   *  WriteConfirmReason} — a write is NOT the only thing that opens this card. */
  confirmWrite?: (info: WriteConfirmInfo) => Promise<boolean>;
  /** BLOCKING pre-search gate: called ONCE (the first time this send uses a
   *  web-search / browser tool) BEFORE the tool runs, so the user can choose which
   *  redaction categories to REVEAL for the conversation (public web content's
   *  place/org/person names are usually the answer's substance).
   *
   *  ⚠️ This governs what the MODEL sees (`disabledKinds`) — root rule 11's own job for
   *  `redactCategories` — NOT what the browser sends. The outward leg is unconditional
   *  and un-redacts the whole vault whatever the user picks here; revealing only stops
   *  the RESULT coming back as a fake the model must then reason over. Never wire this
   *  back into an arg-un-redaction allow-list — a per-category outward gate makes the
   *  search query a placeholder and the search answers about nobody (rule 11).
   *
   *  The store decides whether to actually pause (offerable categories + not opted-out)
   *  or resolve immediately; the loop just awaits it so the search waits for the
   *  decision. Absent = no gate (unchanged). */
  confirmWebNav?: () => Promise<void>;
  /** Un-fake the tokens whose category the reveal gate just disabled, in an ALREADY-wired
   *  string. Applied to the loop's whole message context right after {@link confirmWebNav}
   *  resolves: the history was wired BEFORE the gate, so without this the model keeps
   *  reading the FAKE ("actualités en Russie") for the rest of the turn and researches the
   *  wrong topic — revealing only helped from the NEXT send. No-op when nothing was
   *  revealed. Pinned by `evals/navigation.test.ts` ("REWIRES the current turn"). */
  rewireWire?: (s: string) => string;
  /** Resolve file names the model asked to ATTACH (e.g. Gmail `send_email`) to the
   *  ORIGINAL bytes of the conversation's local files (base64). The model only ever
   *  names files — it never sees the bytes. Resolution runs BEFORE the write-confirm
   *  (audit M1) so the resolved real filenames are shown in the confirmation card and
   *  the user approves exactly which files leave; the bytes are injected into the call
   *  as `__attachmentData` only after approval. A name that matches no stored file
   *  resolves to NOTHING (no "attach everything" fallback). Absent ⇒ no attachments. */
  resolveAttachments?: (
    names: string[],
  ) => Promise<{ filename: string; mimeType: string; contentBase64: string }[]>;
  /** Execute model-generated Python in the sandboxed runtime (code interpreter).
   *  Present ⇒ a `run_python` tool is offered (even with zero connectors); its stdout
   *  is fed back to the model and any matplotlib figures are shown to the user via
   *  {@link onPythonImage}. Absent ⇒ the host has no code interpreter. */
  /** Look up the user's LOCAL memory store (real values) for `memory_search`. The loop
   *  un-redacts the model's query BEFORE calling (the fake becomes the real name) and
   *  re-redacted the returned text before the model sees it. Empty string = no hit.
   *  Absent ⇒ the tool is not offered. */
  searchMemory?: (query: string) => string | Promise<string>;
  runPython?: (
    code: string,
  ) => Promise<{
    ok: boolean;
    stdout: string;
    stderr: string;
    images: { name: string; base64: string }[];
    files: { name: string; base64: string; mime: string }[];
  }>;
  /** A figure produced by `run_python` (PNG bytes, base64) → the store saves it and
   *  pins it as an inline image on the assistant message (same path as tool exports). */
  onPythonImage?: (img: { name: string; base64: string }) => Promise<void> | void;
  /** A DELIVERABLE file produced by `run_python` (PDF/xlsx/docx/…) → the store saves it
   *  and pins it as a downloadable chip on the assistant message. */
  onPythonFile?: (file: { name: string; base64: string; mime: string }) => Promise<void> | void;
  /** A `run_python` call SUCCEEDED: `wireCode` is the script as the MODEL wrote it
   *  (WIRE form — fakes only, pre-`fromWire`). The store keeps it as the turn's
   *  working script (`Message.pythonScript` — no UI) so a follow-up turn ITERATES on
   *  it instead of regenerating the analysis. Best-effort — never breaks the turn. */
  onPythonScript?: (wireCode: string) => Promise<void> | void;
  /** Fetch several URLs' text IN PARALLEL (the batch web reader). Present ⇒ a
   *  `web_fetch_many` tool is offered. The loop un-redacts each URL BEFORE calling and
   *  re-redacted every returned string AFTER. Absent ⇒ no batch reader. */
  fetchMany?: (urls: string[]) => Promise<WebFetchItem[]>;
  /** Overrides the tool-routing/catalog thresholds (`toolRouter`/`toolCatalog`
   *  defaults otherwise). Production call sites never pass this — only the eval
   *  bench sweeps other values to measure the latency/conformance trade-off
   *  (`evals/strategies.ts`). Absent ⇒ today's behaviour, unchanged. */
  routingConfig?: { routing: RoutingConfig; catalog: CatalogConfig };
}


/**
 * Choose which tool SCHEMAS to load (make callable) this turn. Returns the
 * loaded subset (possibly EMPTY when routing picked none — the caller still
 * enters the loop with the awareness catalog + `load_tools`, not a fall-through).
 * Throws when even a pruned set is too large for the model (a clear, actionable
 * error surfaced by the send-error banner, instead of a raw provider 400).
 * Skips the extra round-trip when the full set comfortably fits the window.
 */
async function selectTools(p: McpAgentParams, all: McpTool[], loopId?: string): Promise<McpTool[]> {
  const win = contextWindow(p.modelId) ?? 128_000;
  // Comfortably small → offer everything, no routing call.
  if (!needsRouting(estToolTokens(all), all.length, win, p.routingConfig?.routing)) return all;

  const userText = [...p.history].reverse().find((m) => m.role === "user")?.content ?? "";
  let kept: McpTool[];
  // Journal: the routing decision is otherwise invisible — a « 0/314 outils » line
  // with no why. Log which way it went (pick / empty pick / router threw → budget
  // pare) and what was chosen, so a weak model groping for tools is diagnosable.
  const routePhase = pushDebug(
    {
      type: "phase", scope: "loop", label: "Routage des outils",
      detail: `${all.length} outils (~${Math.round(estToolTokens(all) / 1000)}k tokens) > budget — routage en cours…`,
    },
    p.convId,
  );
  // The router's verdict, kept so the rescue below ADDS to the line
  // instead of overwriting it: « pick VIDE » then « 2/296 » with nothing in between was
  // exactly the illegibility of the 27/07/2026 journal.
  let routeDetail = "";
  // Cooldown: a recent router failure (usually configuration — provider 401) skips
  // straight to the deterministic pare instead of burning a dead round-trip per send.
  if (routerCooldownActive(Date.now())) {
    kept = fitToBudget(all, win, p.routingConfig?.catalog);
    routeDetail = `routeur en pause (échec récent) → repli déterministe : ${kept.length}/${all.length} outils`;
    updateDebug(routePhase, { ok: true, detail: routeDetail });
  } else
  try {
    const keep = await routeTools({
      tools: all.map((t) => ({ name: t.name, description: t.description, serverId: t.serverId })),
      userText,
      complete: p.host.completeTools!,
      provider: p.provider,
      modelId: p.modelId,
      apiKey: p.apiKey,
      baseUrl: p.baseUrl,
      requestId: p.requestId,
      cfg: p.routingConfig?.routing,
      loopId,
    });
    noteRouterSuccess();
    // Empty pick → no schema loaded, but the loop still runs with the catalog +
    // load_tools so a capability question is answered from real awareness.
    kept = all.filter((t) => keep.has(t.name));
    routeDetail = kept.length
      ? `pick routeur : ${kept.length}/${all.length} — ${kept.slice(0, 12).map((t) => t.name).join(", ")}${kept.length > 12 ? "…" : ""}`
      : `pick routeur VIDE (0/${all.length}) — la boucle continue avec le catalogue + load_tools`;
    updateDebug(routePhase, { ok: true, detail: routeDetail });
    // An EMPTY pick is a measurable miss: the model goes on with no connector tool at
    // all and must go through `load_tools`, i.e. two turns of waiting for the user. Nothing
    // counted it — hence the impossibility of telling whether the router aims true (27/07/2026
    // journal: empty on a request that NAMED the connector).
    if (!kept.length) {
      captureEvent({ name: "tool_route_miss", kind: "empty", offered: 0, available: all.length, connector: "", provider: p.provider, model: p.modelId, loopId });
    }
  } catch (e) {
    // STOP during the router call — neither a failure nor a capricious model.
    // `host.cancelTools(requestId)` aborts THIS fetch (the router shares the turn's
    // `requestId`), and this `catch` read it as "router failed": it armed the
    // 5-min cooldown — routing stayed degraded for the FOLLOWING sends —,
    // counted a `tool_route_miss` that pollutes the router's measurement, then fell back on
    // the deterministic pare. The loop then started right back up: that's what made
    // Stop, clicked during routing, stop nothing (11/08/2026 journal:
    // eleven `action:stop` then a `tool_route_miss` and the turn continuing).
    // We return control right away; the `aborted()` at the head of the loop finalizes the bubble.
    if (p.signal?.aborted || isAbortError(e)) {
      updateDebug(routePhase, { ok: false, detail: "routage interrompu (Stop)" });
      return [];
    }
    // Router failed → keep-all-if-it-fits, else pare. UNREADABLE (typed) = model
    // flakiness on ONE call: same fallback, but never the 5-min config cooldown.
    if (e instanceof RouterUnreadableError) {
      captureEvent({ name: "tool_route_miss", kind: "unreadable", offered: 0, available: all.length, connector: "", provider: p.provider, model: p.modelId, loopId });
    } else noteRouterFailure(Date.now());
    kept = fitToBudget(all, win, p.routingConfig?.catalog);
    routeDetail = `routeur en échec (${e instanceof Error ? e.message.slice(0, 120) : "?"}) → repli déterministe : ${kept.length}/${all.length} outils`;
    updateDebug(routePhase, { ok: false, detail: routeDetail });
  }
  // The router is a model call: it prunes the ENTRY tool that the request
  // can't do without (the browser for a news question, enumeration for a
  // files question). The rescues — additive, bounded, `load_tools` keeping the
  // rest within reach — live in `entryTools.ts`, with their reasons.
  kept = rescueEntryTools(kept, all, userText);
  // CONNECTOR rescues — the scoped one (always) then the named one (empty pick only);
  // reasons and bounds in `connectorRescue.ts`.
  {
    const s = rescueScopedConnectors(kept, all, p.scopedConnectors ?? [], win);
    const n = rescueNamedConnectors(s.kept, all, userText, win);
    kept = n.kept;
    for (const r of n.rescued)
      captureEvent({ name: "tool_route_rescue", connector: r.id, tools: r.added, provider: p.provider, model: p.modelId, loopId });
    const parts = [...s.rescued.map((r) => `${r.id} (+${r.added})`), ...n.rescued.map((r) => `${r.id} (+${r.added}, nommé)`)];
    if (parts.length)
      updateDebug(routePhase, { ok: true, detail: `${routeDetail} · rattrapage : ${parts.join(", ")}` });
  }
  if (estToolTokens(kept) > win * 0.85) {
    // The router can legitimately keep EVERYTHING (« test them all » → 296/296), and the mere
    // definitions then exceed the model's context. This is not a failure: it's a
    // capacity limit, and the product already knows how to work around it — `fitToBudget` keeps
    // the least verbose schemas, `load_tools` makes the rest accessible on demand, and it's
    // exactly the path taken when the router FAILS. Refusing the turn sent
    // the user back to "disconnect some connectors" when the app could have answered.
    const fitted = fitToBudget(kept, win, p.routingConfig?.catalog);
    if (fitted.length) {
      updateDebug(routePhase, {
        ok: true,
        detail:
          `${routeDetail} · budget de contexte : ${fitted.length}/${kept.length} outils gardés, ` +
          "les autres restent accessibles via load_tools",
      });
      return fitted;
    }
    // Nothing fits, not even the shortest schema: this time it's a genuine dead end and it
    // says so (product rule: a real failure is always shown, never silent).
    const est = Math.round(estToolTokens(kept) / 1000);
    const ctx = Math.round(win / 1000);
    throw new Error(
      `Trop d'outils connectés pour ${p.modelId} (~${est}k tokens de définitions > ${ctx}k de contexte). ` +
        "Choisis un modèle à plus grand contexte ou déconnecte des connecteurs.",
    );
  }
  return kept;
}

// Turn budget for the agentic loop — ADAPTIVE, so a genuinely long pipeline (list
// Stripe customers → build a CSV → upload to Dropbox → share → email the link is
// 5+ distinct steps) isn't guillotined at a flat cap, while a model thrashing on
// invalid args can't run away. Every turn starts with BASE_TURNS; each turn that
// makes real FORWARD PROGRESS — a tool call that SUCCEEDS with a NEW result (not a
// repeat, not an arg-error) — grants TURNS_PER_PROGRESS more, up to MAX_TURNS_HARD.
// A stuck/retrying model earns nothing and stays near the base; the stuck-loop guard
// (STUCK_STOP identical results) + write-confirmation still bound the downside.
const BASE_TURNS = 14;
const TURNS_PER_PROGRESS = 3;
const MAX_TURNS_HARD = 40;


// Time-to-first-token watchdog for a STREAMED model call: if the model emits
// NOTHING — no prose, no tool-call argument — within this budget, it's stuck in
// prefill (a huge tool payload, e.g. 298 connected tools, on a slow model). We abort
// the call and surface a clear error instead of hanging for minutes. Cleared on the
// first token. The plain-stream (non-tools) path has its own watchdog in store.ts;
// this one covers the agentic loop, which previously had NONE. A recognised marker
// (`MODEL_STALL`) so `humanizeSendError` can give an actionable message.
const TTFT_WATCHDOG_MS = 45_000;
const MODEL_STALL_ERROR = "MODEL_STALL";
/** Hard budget for a NON-streamed model turn — that path has no first-token signal,
 *  so a hung provider (free tiers under load: measured 420 s+ before the scenario
 *  timeout killed the run) parked the whole loop. Generous: a slow SUCCESS beats a
 *  false stall; the streamed path keeps the tighter TTFT watchdog. */
const COMPLETE_TOOLS_TIMEOUT_MS = 120_000;
// Coalesce streamed-token UI updates to ~animation cadence (matches store.ts's plain-stream
// FLUSH_MS). Without it the agentic path un-redacted the WHOLE accumulated reply on EVERY
// token (`fromWire(acc)` = O(n²)) and re-rendered/re-parsed the pending bubble per token —
// the dominant slowdown of an agentic/browser turn (every browser turn streams through it).
const STREAM_FLUSH_MS = 40;
// Hard-stop when ONE tool returns the SAME result this many times in a turn. 3 = two
// chances to react to the appended hint, then cut instead of burning the turn cap.
const STUCK_STOP = 3;
// Deterministic backstop for a loop that CAN'T advance yet never repeats the EXACT
// same (tool, result): varied `run_python` failures, a write the user keeps declining
// (incl. a confirm dialog DISMISSED). STUCK_STOP misses these (distinct results), so we
// ALSO count non-productive outcomes across ALL tools — but AT MOST ONCE PER MODEL
// RESPONSE (`bumpDead`): a batch of 7 `read_file` sur le même « utilise read_document »
// brûlait toute la série en UNE réponse, tuant le tour AVANT que le modèle ait pu lire
// le feedback (journal 02/08). La série mesure des RÉPONSES sans avancée, jamais des
// appels ; remise à zéro sur tout appel productif.
const MAX_CONSECUTIVE_DEAD = 5;
// Per-tool HARD backstop: a single tool called more than its cap in ONE turn stops the loop,
// whatever its args or results. STUCK_STOP/MAX_CONSECUTIVE_DEAD both key on UNproductivity —
// but a model can hammer ONE tool with ever-new args, each returning a real, non-dead-end
// result (so "productive", even extending the turn budget), and never converge on an answer.
// The eval bench measured `execute_sql` / `run_python` / `posthog__exec` at 9–15× on the
// weaker models. The cap is PER CLASS (`maxSameToolCalls`, in `mcpAgentClassify.ts`): 8 for an
// ordinary tool, 20 for a governed web READ — browsing IS iterative, and the flat cap cut a
// legitimate research turn mid-course. Pinned by `mcpAgent.test.ts`. A result that means the
// tool could NOT perform the request (a dead end), as opposed to a valid-but-empty answer
// (`{"results":[]}` — a search that ran fine and found nothing). Only dead-ends/errors count
// toward the stuck guard even when the ARGS differ; a valid empty result for a NEW input is
// legitimate exploration (e.g. checking several customers in Stripe, each correctly "not
// found").
const DEAD_END_RE =
  /no matching operation|aucune op[ée]ration correspondante|operation not found|unknown operation|unsupported operation|no such (tool|operation|method|endpoint)/i;

/**
 * Run the agentic MCP loop: let the model call connector tools (Gmail, …), with
 * every tool argument un-redacted before the real server and every result
 * re-redacted into the vault before the model sees it. Returns `false` when no
 * MCP tools are available (caller falls back to the normal streaming path).
 */
export async function runMcpAgentLoop(p: McpAgentParams): Promise<boolean> {
  if (!p.host.mcp || !p.host.completeTools) return false;
  const mcp = p.host.mcp;
  const loopId = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`; // the agentic funnel (events.ts)
  const loopT0 = Date.now(); // the summary's wall-clock duration (3 turns in 20s ≠ in 12min)
  // Every Debug-Log entry from this turn is stamped with the conversation, so the
  // journal is scoped per conversation (concurrent per-tab turns never interleave).
  const dbg = (e: Parameters<typeof pushDebug>[0]): string => pushDebug(e, p.convId);

  // An McpConnection that proxies over IPC to the main process. Main already
  // namespaced tool names, so the redacting client must NOT namespace again.
  // (The renderer-minted write-approval token that used to ride this call was a
  // fail-open and is REMOVED end to end — main ignores any such token and enforces
  // its own write gate; see `apps/desktop/src/main/mcp/server/callTool.ts`.)
  const ipcConn: McpConnection = {
    id: "ipc",
    listTools: () => mcp.listTools(),
    callTool: (call) => mcp.callTool(call),
    close: async () => {},
  };
  // A file RETURNED by a tool (Drive/Notion/…) is extracted to text in main
  // (OCR libs are Node-only) so the client can redact it before the model
  // sees it — the model never receives the raw bytes.
  const extractBytes = p.host.files?.extractBytes;
  const extractFile = extractBytes
    ? (data: string, mime: string) => extractBytes(data, "file", mime).then((r) => r.text)
    : undefined;
  // A downloadable file URL in a tool result (e.g. a Canva export link) is
  // stripped from the model-facing text by the client; we collect them here and
  // fetch + display the real file to the user after the call returns.
  const exportedUrls: { url: string; mime: string }[] = [];
  // The RedactingMcpClient now threads the tool NAME into `redactResult`/`onFileUrl` PER
  // CALL (no shared "current tool" var), so the connector-specific policy (web-search
  // results keep place/org names) stays correct even when several tool calls redact their
  // results concurrently (read-only calls of a turn run in parallel — see the loop below).
  // Concurrent redactions mutate the SHARED vault, so engine passes stay SERIAL (one fake
  // per value — atomic identity); what queues behind a busy pass leaves in ONE same-tool
  // batched pass instead of one NER inference per result (`redactCoalesce.ts`).
  const redactResult = p.redactResult
    ? makeCoalescingRedactor({ one: p.redactResult, many: p.redactResult.many })
    : undefined;
  // ⚠️ Root rule 11 — the MODEL is the only thing that ever sees a fake. Every connector's
  // args are un-redacted, the BROWSER INCLUDED: a Gmail send must reach the REAL recipient,
  // and a search must query the REAL value or it answers about nobody. There is deliberately
  // no `unredactArg` override on the client — its default un-redacts the WHOLE vault. A
  // per-category gate on this OUTWARD leg is the bug, not the safeguard: `disabledKinds`
  // decides what the model sees and nothing else. The exfil backstops (the domain allow-list,
  // `analyzeNavExfil`, the confirm card) are below, and the residual they knowingly accept is
  // stated in this folder's CLAUDE.md. `wireArg` mirrors that client default EXACTLY, and the
  // nav scan + the confirm card are both derived from it rather than from `fromWireArgs`. They
  // must show/scan what the host ACTUALLY receives, and only `unredactArgs` restores a fake's
  // URL-ENCODED forms — a fake with a space reaches a query string as
  // `Louis%20Simon`/`Louis+Simon`, which the store's literal un-redactor never matches.
  // Deriving from a second un-redactor lets the card and the wire drift; `mcpAgent.test.ts`
  // pins the encoded case.
  const wireArg = (text: string): string => unredactArgs(text, p.vault);
  // ── DYNAMIC browser redaction (clear-mode) ──────────────────────────────────── A governed
  // web tool (integrated browser / catalog `search` connector — never a name-derived class)
  // whose call touches NO redacted data is reading PUBLIC content: its results reach the model
  // replay-only (`makeNavClearRedactor` — which itself escalates fail-closed on a Coffre hit /
  // credential shape) and the pre-search reveal card is skipped (nothing would be masked, so
  // it has nothing to offer). The decision is PER CALL: the moment a call carries a vault
  // value (the wire differs from what the model wrote, or a sensitive value sits in the args),
  // that call — and the reveal gate — get the full path again. Any error deciding ⇒ full path
  // (the relaxation is only ever granted on an explicit "clean" verdict). Loop-level counters
  // for the `tool_loop_summary` analytics event (counts only).
  const loopStats = { toolCalls: 0, loadToolsUnknown: 0, navClear: 0, navEscalated: 0 };
  // A DETERMINISTIC GATE refused/blocked a call — including the USER'S decline of the
  // write card, until now with no data at all (13/08 audit). Enums + names only.
  const gateBlocked = (kind: Extract<Parameters<typeof captureEvent>[0], { name: "tool_gate_blocked" }>["kind"], tool: string, connector: string) =>
    captureEvent({ name: "tool_gate_blocked", kind, tool, connector, provider: p.provider, model: p.modelId, loopId });
  const navClearRedactor = redactResult
    ? makeNavClearRedactor({
        full: redactResult,
        secrets: p.secrets ?? [],
        // The LIVE array (the reveal gate mutates it in place) + this send's
        // value→kind spans, so the replay honours the same per-tool clear policy
        // (BROWSER_CLEAR/SEARCH_CLEAR + user reveals) as the full path.
        disabledKinds: p.disabledKinds ?? [],
        kinds: p.kinds,
        structuralUrlHosts: p.structuralUrlHosts,
        onEscalate: () => {
          loopStats.navEscalated += 1;
        },
        convId: p.convId,
      })
    : undefined;
  const navClearFor = (callName: string, rawArgs: Record<string, unknown>): boolean => {
    if (!navClearRedactor || !isGovernedWebTool(callName)) return false;
    try {
      const wireArgs = deredactArgs(rawArgs, wireArg) as Record<string, unknown>;
      const sensitive = [...Object.values(p.vault ?? {}), ...(p.secrets ?? [])];
      return !navCarriesRedactedData(rawArgs, wireArgs, sensitive);
    } catch {
      return false; // fail closed: undecidable ⇒ full redaction path
    }
  };
  // Does THIS call's query carry a vault value the reveal card could actually reveal?
  // The card only offers name/dob/address/location/company (WEBNAV_OFFER_KEYS), so a query
  // carrying ONLY a number/secret — e.g. a bare year the number-tokeniser vaulted as `n1` —
  // must NOT pop the card (the reported "2026 on a PII-free prompt" bug). Filter the vault
  // reals to those offer categories via `p.kinds`, then check the wire args. This gates the
  // CARD only; clear-mode + outward un-redaction (rule 11) are untouched.
  const offerKeys = new Set<string>(WEBNAV_OFFER_KEYS);
  const navCarriesOfferable = (rawArgs: Record<string, unknown>): boolean => {
    try {
      const wireArgs = deredactArgs(rawArgs, wireArg) as Record<string, unknown>;
      const offerable = Object.values(p.vault ?? {}).filter((real) =>
        offerKeys.has(redactionCategory(p.kinds?.[real] ?? "")),
      );
      return navCarriesOfferableData(wireArgs, offerable);
    } catch {
      return true; // undecidable ⇒ keep prior behaviour (show the card), never a leak
    }
  };
  const navClearOpts = (
    callName: string,
    rawArgs: Record<string, unknown>,
  ): { redactText: (text: string, vault: Vault) => Promise<string> } | undefined => {
    if (!navClearFor(callName, rawArgs)) return undefined;
    loopStats.navClear += 1;
    return { redactText: (text, vault) => navClearRedactor!(text, vault, callName) };
  };
  const client = new RedactingMcpClient({
    connections: [ipcConn],
    vault: p.vault,
    secrets: p.secrets,
    disabledKinds: p.disabledKinds,
    // Use the model engine for tool results when provided, so free-form PII in a
    // CRM/tool payload (names, odd-format phones) is caught — regex alone can't.
    redactResult,
    extractFile,
    // Collect downloadable file URLs to fetch+display — EXCEPT from a web-search
    // connector, whose results carry many page images (og:image, decoration) that
    // aren't user exports; downloading them floods the library with junk.
    onFileUrl: p.onExportedFile
      ? (url, mime, tool) => {
          if (!isSearchTool(tool ?? "")) exportedUrls.push({ url, mime });
        }
      : undefined,
    namespace: false,
  });

  // Schémas distants assainis AVANT tout lecteur (routage, toolInfo, argErrorHint) —
  // un `required` dégénéré rend l'outil inappelable ; le pourquoi : `schemaSanity.ts`.
  const allTools = sanitizeToolSchemas(await client.listTools());
  // Org enforcement: keep ONLY the tools whose connector the org opened, so a member
  // can't invoke a server that was connected before the policy landed — ni un
  // connecteur arrivé au catalogue après elle.
  // Allow-list (règle 7) : un outil ne passe que si son connecteur figure dans ce que
  // l'organisation a ouvert. La normalisation d'id (préfixes `broker-`/`local-`,
  // instances multi-comptes) vit dans `privacy/orgAllowList.ts`, partagée avec l'écran
  // des réglages — les deux copies avaient divergé.
  const isBlockedId = (id: string | undefined): boolean =>
    !isConnectorAllowed(id, p.allowedServerIds);
  /**
   * ⚠️ Le connecteur se lit sur le NOM, pas sur `serverId`. `RedactingMcpClient.listTools`
   * réécrit `serverId` avec l'id de la CONNEXION, et la boucle n'en a qu'une (`ipcConn`,
   * id « ipc ») : `serverId` valait donc « ipc » pour TOUS les outils, la comparaison ne
   * pouvait matcher aucun id de connecteur, et le blocage d'organisation ne bloquait
   * rien — un connecteur interdit mais déjà connecté restait appelable par l'agent,
   * exactement le cas que ce filtre existe pour couvrir. Main namespace les noms
   * (`gmail__send_email`), donc le préfixe est la source fiable ; `serverId` reste testé
   * en second pour les hôtes qui donnent une connexion par connecteur.
   */
  const isBlockedTool = (t: McpTool): boolean => {
    const i = t.name.indexOf("__");
    // ⚠️ Un OR (nom OU serverId) était juste en liste de refus ; en allow-list il
    // refuserait TOUT, `serverId` valant « ipc » partout. On identifie UN connecteur —
    // préfixe du nom d'abord, `serverId` à défaut — et on juge cet id-là. Un outil
    // qu'aucun connecteur ne revendique (`run_python`, `memory_search`) n'est pas
    // gouverné ici ; un serveur ajouté à la main (`custom-…`) l'est, et tombe.
    const id = (i > 0 ? t.name.slice(0, i) : undefined) ?? t.serverId;
    if (!id) return false;
    const governed = id.startsWith("custom-") || !!findConnector(connectorIdFromInstance(id));
    return governed && isBlockedId(id);
  };
  const notBlocked = p.allowedServerIds ? allTools.filter((t) => !isBlockedTool(t)) : allTools;
  // Read-only browser (recherche = lecture seule): strip the interaction/mutation
  // browser tools so the model can only NAVIGATE + READ — an injected page can't
  // steer it into clicking/typing/submitting in an authenticated SaaS.
  const mcpTools = p.browserReadOnly
    ? notBlocked.filter((t) => !isBrowserWriteTool(t.name))
    : notBlocked;
  // Enter the loop when there are connector tools OR an intercepted capability is on —
  // so `run_python` / `memory_search` work even with zero connectors. Otherwise fall
  // through to plain streaming (unchanged behaviour when none is present).
  if (mcpTools.length === 0 && !p.runPython && !p.searchMemory && !p.fetchMany) return false;

  // ROUTING pre-pass: offer only the tools relevant to THIS request, so a
  // connector-heavy setup (Webflow's dozens of tools) doesn't overflow the
  // model's context window (which 400s a whole tool-calling turn otherwise).
  const selected = await selectTools(p, mcpTools, loopId);
  // Pruned = the callable set is a STRICT subset of everything connected. Then
  // AWARENESS (the full catalog) and `load_tools` are injected so the model still
  // knows every tool and can pull any schema on demand. A full set skips both.
  const pruned = selected.length < mcpTools.length;
  const win = contextWindow(p.modelId) ?? 128_000;
  const fullByName = new Map<string, McpTool>(mcpTools.map((t) => [t.name, t]));

  // Callable schemas: the loaded subset (+ the internal load_tools meta-tool when
  // pruned). `toolDefs`/`toolInfo` GROW in place as load_tools pulls more.
  // Sorted by NAME so the serialized tool list is DETERMINISTIC across sends and
  // sessions (listTools order follows connection order): a stable prompt prefix is
  // what lets the provider-side prompt cache hit — the tool schemas are the bulk of
  // every turn's input tokens (mesuré : ~9-15k ↑/workflow, ~95 % du coût).
  const toolDefs: ToolDef[] = selected.map(toolDefOf).sort((a, b) => a.name.localeCompare(b.name));
  if (pruned) toolDefs.push(LOAD_TOOLS_DEF);
  // Code interpreter: always callable when the host exposes it. Intercepted below —
  // never proxied to a server; runs Python in the sandbox and shows figures inline.
  if (p.runPython) toolDefs.push(RUN_PYTHON_DEF);
  if (p.searchMemory) toolDefs.push(MEMORY_SEARCH_DEF);
  if (p.fetchMany) toolDefs.push(WEB_FETCH_MANY_DEF);
  // Integration suggestions: the model calls `suggest_integrations` when it can't act for lack
  // of a NOT-connected connector, and we render clickable connect cards. Candidates = every
  // catalog connector this user hasn't connected. Offered whenever the host can surface them
  // (`onSuggestIntegrations` wired) — intercepted below, never proxied. The block is injected
  // into the system prompt so the model knows the ids + what each unlocks. The controllable
  // browser is connected → it already does web search, so we drop `category:"search"`
  // connectors from the suggestions below AND steer the model to browse
  // (BROWSER_RECENCY_GUIDANCE) instead of asking to connect Tavily/Exa.
  const hasBrowser = mcpTools.some((t) => isWebBrowseTool(t.name));
  // The built-in browser covers web search — so drop `category:"search"` connectors from
  // the suggestions whether it's already CONNECTED or merely ENABLEABLE (the app has it,
  // just not on): pushing paid Exa/Tavily/Firecrawl when a free browser exists is the
  // reported bug ("propose des connecteurs de recherche alors que la recherche navigateur existe").
  // And when it's enableable-but-off, the browser itself becomes a CANDIDATE, so it's
  // offered as a one-click card like any other integration instead of a prose detour.
  const browserState = { connected: hasBrowser, enableable: !!p.browserEnableable };
  // ⚠️ Connected = read from the tool NAMES (prefix), never `serverId` alone — the
  // client rewrites serverId to its single connection id ("ipc"), which made EVERY
  // connector look not-connected and the model re-suggest one the user had just
  // connected. See `connectorIdsFromTools`.
  const connectedIds = connectorIdsFromTools(allTools);
  const suggestCandidates = p.onSuggestIntegrations
    ? notConnectedConnectors(connectedIds, browserState)
    : [];
  // What the user ALREADY has — a need it covers proposes nothing (`connectorsForRequest`).
  const alreadyConnected = p.onSuggestIntegrations ? connectedConnectors(connectedIds) : [];
  let suggestBlock = suggestCandidates.length ? suggestGuidance(suggestCandidates) : "";
  if (suggestCandidates.length) toolDefs.push(suggestIntegrationsDef(suggestCandidates));
  // A workflow DECLARES what it needs, so a missing connector is known before the first
  // model call — see `scopePreflight`.
  const scope = scopePreflight(p.scopedConnectors, connectedIds);
  let suggested = false; // the model proposed some itself — its pick wins over ours
  // La partie TAPÉE seulement — le wire porte aussi les documents pliés et NOS notes
  // d'échafaudage, qui déclenchaient des cartes d'intégration (voir `typedPartOfWire`).
  const requestText = typedPartOfWire(String([...p.history].reverse().find((m) => m.role === "user")?.content ?? ""));
  // Browser exists but isn't connected → steer the model to PROPOSE it (the card above)
  // rather than a paid connector or a hallucinated answer. Only when it's not already usable.
  if (p.browserEnableable && !hasBrowser) suggestBlock += BROWSER_ENABLE_HINT;

  // name → tool (schema + server id), for pre-validation + the struggle hint.
  const toolInfo = new Map<string, McpTool>(selected.map((t) => [t.name, t]));
  const serverOf = (tool: string) => toolInfo.get(tool)?.serverId ?? "mcp";
  const struggle = makeStruggleReporter({ serverOf, onToolStruggle: p.onToolStruggle, provider: p.provider, modelId: p.modelId, loopId });
  const { succeeded, argErrored, connectorErrored } = struggle;
  const argErrorCount = new Map<string, number>(); // per-tool arg-error attempts
  const callCounts = new Map<string, number>(); // real tool calls issued per tool
  const capNotedTurn = new Map<string, number>(); // turn where the per-tool cap note was delivered
  let budgetNotedTurn = -1; // turn where the context-budget refusal was delivered
  // Ce qui borne un batch de lectures — pourquoi le NOMBRE d'appels n'y suffit pas, et
  // pourquoi le prefetch part par vagues : `readBudget.ts`.
  const charBudget = resultCharBudget(contextWindow(p.modelId));
  const usedChars = () => toolResultChars(messages);
  const resultEcho = new ResultEchoLedger(); // per-connector WIRE results (arg-exfil provenance)
  const resultTally = new Map<string, number>(); // count per identical (tool,result)
  const resultArgs = new Map<string, Set<string>>(); // distinct arg-signatures per (tool,result)
  const unproductiveTally = new Map<string, number>(); // non-progress count per (tool,result)
  let soloRead: SoloReadStreak | null = null; // reads emitted one target at a time
  let webNavAsked = false; // the pre-search reveal gate fires ONCE per send
  const opResolved = new Set<string>(); // deduped (connector|resource|action) live-derive probes
  const repeatedResult = new Map<string, number>(); // max repeats-beyond-first per tool
  const seenIds = new Set<string>(); // identifiants montrés par les résultats (`identifierTypo.ts`)
  let repeatedFailure: ReturnType<typeof repeatedFailureOf> | undefined;

  // `hasBrowser` (computed above) also drives BROWSER_RECENCY_GUIDANCE — steer the model to
  // verify anything posterior to its training cutoff (recent/live data) by browsing, not from
  // memory. RESUME (Option B): a retry seeds the PRIOR attempt's tool-turn transcript AFTER
  // the history, so the model continues from where it stopped instead of redoing the whole
  // turn. `baseLen` marks the end of that seeded prefix; everything pushed past it is THIS
  // run's new work, and `priorTranscript + slice(baseLen)` is the full replayable state.
  const priorTranscript = p.resumeTranscript ?? [];
  // `enabled` defaults true (production, always) — `false` only from a bench strategy
  // isolating the awareness catalog's own cost; never from a real send.
  const catalogEnabled = p.routingConfig?.catalog?.enabled ?? true;
  const messages = withToolGuidance([...p.history, ...priorTranscript], pruned && catalogEnabled ? toolCatalog(mcpTools, p.routingConfig?.catalog) : undefined, !!p.runPython, suggestBlock, hasBrowser, !!p.fetchMany);
  const baseLen = messages.length;
  const checkpointTranscript = () =>
    p.onResumeTranscript?.([...priorTranscript, ...messages.slice(baseLen)]);
  // Did the model call ANY tool this turn? If it never does and then declines in
  // prose, it likely didn't realise it should act (the `no_tool_used` hint).
  let anyToolCall = false;
  // Guards the one-shot forced-tool retry (below): a weak model that declines in
  // prose is re-asked once with tool_choice=required before we give up.
  let forcedRetryDone = false;
  let emptyRetryDone = false;
  let stallRetryDone = false;
  // Set by a SOFT model call (the opportunistic forced retry) that failed for a
  // reason other than an abort — e.g. the provider rejects tool_choice=required
  // (certains paliers gratuits 400 dessus). Lets the caller tell "the forced retry
  // couldn't run, keep the answer we already have" from a genuine Stop.
  let softCallFailed = false;

  // Accumulate token usage across every model call this agentic turn makes.
  let inputTokens = 0;
  let outputTokens = 0;
  // La PART de `inputTokens` servie par le cache du provider, et celle qu'un tour a dû
  // ÉCRIRE dedans. C'est la seule mesure qui dit si le préfixe stable (prompt système +
  // schémas d'outils, re-envoyés à chaque tour) est réellement réutilisé : une boucle
  // agentique renvoie tout l'historique à chaque échange, donc un cache qui rate se lit
  // comme une facture d'entrée qui enfle sans que rien ne le signale.
  let cachedInputTokens = 0;
  let cacheWriteInputTokens = 0;
  // Combien d'ÉCHANGES modèle ce cumul recouvre. Sans lui, le journal affichait
  // « 28 079 entrée » sous un message de 221 caractères — le cumul du tour entier
  // présenté comme le coût de CE message, à côté d'un « 13 938 entrée » au tour 1 qui
  // le contredisait (journal du 27/07/2026). Le chiffre était juste, la légende non.
  let modelTurns = 0;
  const emitUsage = () => {
    if (inputTokens || outputTokens)
      p.onUsage?.({
        inputTokens,
        outputTokens,
        ...(cachedInputTokens ? { cachedInputTokens } : {}),
        ...(cacheWriteInputTokens ? { cacheWriteInputTokens } : {}),
        toolCount: mcpTools.length,
        modelTurns,
      });
  };
  // ONE `tool_loop_summary` per run (privacy-safe counts + a bounded outcome) — the
  // aggregate view of a laborious session: empty router picks, hallucinated
  // `load_tools` names, clear-mode escalations. Guarded so multiple exit paths can
  // call it; the FIRST outcome wins (it's the one that ended the run).
  let summaryEmitted = false;
  const emitLoopSummary = (
    outcome: "answered" | "exhausted" | "aborted" | "error",
    reason?: SendErrorReason | "browser_backend",
  ) => {
    if (summaryEmitted) return;
    summaryEmitted = true;
    captureEvent({
      name: "tool_loop_summary",
      provider: p.provider, model: p.modelId, loopId,
      turns: currentTurn + 1, toolCalls: loopStats.toolCalls, ms: Date.now() - loopT0,
      routerOffered: selected.length, routerTotal: mcpTools.length,
      loadToolsUnknown: loopStats.loadToolsUnknown,
      navClear: loopStats.navClear, navEscalated: loopStats.navEscalated,
      outcome,
      ...(reason ? { reason } : {}),
    });
  };

  // Latest de-redacted assistant text, so a Stop mid-loop finalizes the bubble
  // with whatever the model already said (or a short "interrupted" note).
  let lastText = "";
  // Current turn index, so the live "model" debug phase can name its turn.
  let currentTurn = 0;
  const aborted = () => p.signal?.aborted === true;
  const finalizeAborted = (): true => {
    // Persist what the turn accumulated BEFORE leaving: a Stop can land mid-batch with
    // a dispatched call whose outcome is unknown, and without this checkpoint the retry
    // replays the PREVIOUS turn's transcript — where the call "never happened" — and
    // re-emits the write (audit §2.1). The resume path seals every unanswered call.
    checkpointTranscript();
    dbg({ type: "phase", scope: "system", label: "Interrompu par l'utilisateur", ok: false });
    p.onText(lastText || p.fromWire("_(Interrompu.)_"), false);
    emitUsage();
    emitLoopSummary("aborted");
    return true;
  };

  // Le Stop peut avoir été cliqué pendant le ROUTAGE (`selectTools`, un appel de modèle
  // qui précède ces aides et peut durer). Sans ce point d'arrêt, un tour interrompu
  // continuait jusqu'au premier `aborted()` de la boucle en affichant d'abord des cartes
  // « connecteur manquant » — voire en TERMINANT dessus (`scope.unusable`), c'est-à-dire
  // en répondant à un tour que l'utilisateur venait d'annuler.
  if (aborted()) return finalizeAborted();

  // BEFORE the first model call: the cards are computable now, and a turn spent
  // discovering a missing connector ends in prose the user still has to act on.
  if (scope.missing.length) {
    suggested = true;
    p.onSuggestIntegrations?.(scope.missing.slice(0, MAX_SUGGESTIONS));
    if (scope.unusable) {
      p.onText(p.fromWire(missingConnectorMessage(scope.missing)), false);
      emitUsage();
      emitLoopSummary("error");
      return true;
    }
  }

  type ToolsResult = Awaited<ReturnType<NonNullable<Host["completeTools"]>>>;
  // Journal « échanges » : per-tour `turn` entries need the count of messages already
  // logged, so each entry carries only the DELTA this tour appended (the failure dump
  // carries the whole request instead). Only maintained while capture is on.
  let loggedMsgCount = 0;
  // Prefer STREAMING the turn when the host supports it: the assistant text
  // arrives token-by-token (via onText pending) instead of the whole reply landing
  // as one blob after a long non-streamed call — which is what made a plain
  // question feel frozen for ~45s once any MCP connector was connected (every send
  // enters this loop). Tool calls are still assembled and returned on done.
  const streamTools = p.host.streamChatTools;
  // One model call for the current turn. `forceTool` sends tool_choice=required
  // so a weak model is MADE to emit a tool call instead of declining in prose.
  // Returns `null` when the call was aborted (caller finalizes the bubble).
  // `soft` = an OPPORTUNISTIC call (the forced retry) whose failure must NOT fail
  // the turn: on a non-abort error it sets `softCallFailed` and returns null
  // instead of throwing, so the caller can keep the answer it already has.
  /** Les outils SANS effet de bord. Un rappel FORCÉ (`tool_choice=required`) n'a le droit
   *  de choisir que là-dedans : forcer un appel est une incitation à aller CHERCHER une
   *  information quand le modèle a répondu à côté — jamais un mandat pour AGIR. Sans ce
   *  filtre, une question a créé un événement dans l'agenda réel de l'utilisatrice
   *  (journal du 27/07/2026 : « de ton compte agenda, à quel compte ? » →
   *  `google-calendar__create_event`). Un effet de bord ne doit jamais naître d'une
   *  heuristique de relance. */
  const readOnlyToolDefs = (): ToolDef[] =>
    toolDefs.filter((d) => {
      const info = toolInfo.get(d.name);
      return !isWriteTool(d.name, info?.description, info?.annotations);
    });

  const callModel = async (forceTool: boolean, soft = false): Promise<ToolsResult | null> => {
    const payload = {
      provider: p.provider,
      model: p.modelId,
      // Wire history COMPACTED for this turn only (old tool-results truncated —
      // token bill + the context pressure that breaks weak models on long chains);
      // `messages` itself stays intact for the journal and later turns.
      messages: compactToolHistory(messages),
      tools: forceTool ? readOnlyToolDefs() : toolDefs,
      apiKey: p.apiKey,
      baseUrl: p.baseUrl,
      requestId: p.requestId,
      ...(forceTool ? { toolChoice: "required" as const } : {}),
    };
    // Live timeline: a slow model turn otherwise leaves the Debug Log blank for
    // seconds/minutes (the tool-call argument streams from the model but isn't
    // surfaced). Log a "model" phase and tick its elapsed clock every second,
    // updated in place — the climbing clock is the decisive signal that a long
    // wait is model latency, not a frozen UI. `chars` reflects streamed PROSE only
    // (tool-call arguments arrive out of band), so it can stay 0 while the clock ticks.
    const t0 = Date.now();
    const phaseId = dbg({
      type: "phase",
      scope: "model",
      label: `Appel modèle · tour ${currentTurn + 1}${forceTool ? " · forcé" : ""}`,
      detail: streamTools ? "streaming…" : "non-streamé…",
    });
    let chars = 0; // streamed PROSE chars
    let argsChars = 0; // streamed tool-call ARGUMENT chars (a big write_file body)
    const tick = setInterval(() => {
      const parts: string[] = [];
      if (chars) parts.push(`${chars} car. texte`);
      if (argsChars) parts.push(`${argsChars} car. args`);
      updateDebug(phaseId, {
        detail: `${streamTools ? "streaming" : "en cours"}… ${Math.round((Date.now() - t0) / 1000)}s${parts.length ? ` · ${parts.join(" · ")}` : ""}`,
      });
    }, 1000);
    try {
      let r: ToolsResult;
      if (streamTools) {
        r = await new Promise<ToolsResult>((resolve, reject) => {
          let acc = "";
          let cancel = () => {};
          // Coalesced flush of the accumulated stream (see STREAM_FLUSH_MS). Declared here so
          // BOTH `onAbort` and `settle` can cancel a pending timer — else it could fire
          // `onText` after the turn already resolved/aborted.
          let flushTimer: ReturnType<typeof setTimeout> | undefined;
          let flushedLen = -1;
          const clearFlush = () => {
            if (flushTimer !== undefined) {
              clearTimeout(flushTimer);
              flushTimer = undefined;
            }
          };
          const flush = () => {
            flushTimer = undefined;
            if (acc.length === flushedLen) return;
            flushedLen = acc.length;
            lastText = p.fromWire(acc);
            p.onText(lastText, true);
          };
          // TTFT watchdog: fire if the model emits NOTHING within the budget (stuck in
          // prefill on a huge tool payload). Cleared on the first token/arg.
          let watchdog: ReturnType<typeof setTimeout> | undefined = setTimeout(() => {
            watchdog = undefined;
            cancel();
            reject(new Error(MODEL_STALL_ERROR));
          }, TTFT_WATCHDOG_MS);
          const clearWatchdog = () => {
            if (watchdog) {
              clearTimeout(watchdog);
              watchdog = undefined;
            }
          };
          // First sign of generation (prose OR a streaming tool-call argument): clears
          // the watchdog and marks TTFT (once), so a tool-first turn is measured too.
          let firstSeen = false;
          const markFirst = () => {
            if (firstSeen) return;
            firstSeen = true;
            clearWatchdog();
            p.onFirstToken?.();
          };
          const onAbort = () => {
            clearWatchdog();
            clearFlush();
            cancel();
            reject(new DOMException("Aborted", "AbortError"));
          };
          p.signal?.addEventListener("abort", onAbort, { once: true });
          const settle = (fn: () => void) => {
            clearWatchdog();
            clearFlush();
            p.signal?.removeEventListener("abort", onAbort);
            fn();
          };
          cancel = streamTools(payload, {
            onChunk: (d) => {
              markFirst();
              acc += d;
              chars = acc.length; // cheap counter for the debug ticker (kept per-chunk)
              // Coalesce: schedule a flush rather than un-redact+render on EVERY token.
              // The final exact text is set after the promise resolves (via `res.text`),
              // so the settled content is always correct even if a flush is skipped.
              if (flushTimer === undefined) flushTimer = setTimeout(flush, STREAM_FLUSH_MS);
            },
            onToolArgs: (n, name) => { markFirst(); argsChars = n; p.onToolArgs?.(n, name); },
            // Reflection ≠ answer (never into `acc`), but it IS generation: it clears the
            // TTFT watchdog, or a model thinking for a minute would read as hung.
            onReasoning: (d) => { markFirst(); p.onReasoning?.(d); },
            onDone: (result) => settle(() => resolve(result)),
            onError: (msg) => settle(() => reject(new Error(msg))),
          });
        });
      } else {
        // The non-streamed path has no TTFT signal — race a hard budget so a hung
        // provider becomes a classified stall (→ retry/dead-end) instead of parking
        // the loop until the caller's own timeout.
        let stallTimer: ReturnType<typeof setTimeout> | undefined;
        try {
          r = await Promise.race([
            p.host.completeTools!(payload),
            new Promise<never>((_, rej) => {
              stallTimer = setTimeout(() => rej(new Error(MODEL_STALL_ERROR)), COMPLETE_TOOLS_TIMEOUT_MS);
            }),
          ]);
        } finally {
          if (stallTimer) clearTimeout(stallTimer);
        }
        // Non-streamed (Anthropic/Google): no incremental signal, so the first token
        // is the completed call — mark TTFT here (approx = whole-call time).
        p.onFirstToken?.();
      }
      modelTurns += 1;
      if (r.usage) {
        inputTokens += r.usage.inputTokens;
        outputTokens += r.usage.outputTokens;
        cachedInputTokens += r.usage.cachedInputTokens ?? 0;
        cacheWriteInputTokens += r.usage.cacheWriteInputTokens ?? 0;
      }
      const n = r.toolCalls.length;
      updateDebug(phaseId, {
        label: `Réponse modèle · tour ${currentTurn + 1}`,
        ok: true,
        ms: Date.now() - t0,
        detail: n
          ? `${n} appel${n > 1 ? "s" : ""} d'outil${r.text.trim() ? ` · ${r.text.length} car. de texte` : ""}`
          : `${r.text.length} car. de texte`,
      });
      // Journal « échanges » : the COMPLETE exchange of this tour — the messages this
      // tour appended to the request (the rest is the prior tours, already logged) +
      // the raw response (prose, tool calls, stopReason, usage). Wire form throughout.
      if (isDebugCapture()) {
        dbg({
          type: "turn", model: p.modelId, turn: currentTurn + 1, ok: true,
          request: turnRequestDelta(messages, loggedMsgCount), msgCount: messages.length,
          toolsOffered: toolDefs.length, toolNames: turnToolNames(toolDefs),
          toolChoice: forceTool ? "required" : "auto",
          text: r.text, toolCalls: r.toolCalls.map(turnToolCall), stopReason: r.stopReason,
          inputTokens: r.usage?.inputTokens, outputTokens: r.usage?.outputTokens,
          cachedInputTokens: r.usage?.cachedInputTokens,
          ms: Date.now() - t0, vault: p.vault, kinds: p.kinds,
        });
        loggedMsgCount = messages.length;
      }
      return r;
    } catch (err) {
      // Stop aborted the in-flight provider fetch — end the turn gracefully.
      if (aborted() || isAbortError(err)) {
        updateDebug(phaseId, { label: `Appel modèle interrompu · tour ${currentTurn + 1}`, detail: "interrompu par l'utilisateur", ok: false, ms: Date.now() - t0 });
        return null;
      }
      updateDebug(phaseId, {
        label: `Échec appel modèle · tour ${currentTurn + 1}`,
        ok: false,
        ms: Date.now() - t0,
        detail: err instanceof Error ? err.message : String(err),
      });
      // Failure dump: the COMPLETE request this call sent (wire form) + the error —
      // enough to diagnose a provider 400 (a malformed tool history, a missing field)
      // from the journal alone, without reproducing.
      if (isDebugCapture()) {
        dbg({
          type: "turn", model: p.modelId, turn: currentTurn + 1, ok: false,
          request: turnRequestFull(messages), requestFull: true, msgCount: messages.length,
          toolsOffered: toolDefs.length, toolNames: turnToolNames(toolDefs),
          toolChoice: forceTool ? "required" : "auto",
          ms: Date.now() - t0,
          error: err instanceof Error ? err.message : String(err),
          vault: p.vault, kinds: p.kinds,
        });
      }
      // A soft (opportunistic) call swallows the failure: the turn already has a
      // valid prose answer, so a rejected forced-tool retry must not turn it red.
      if (soft) {
        softCallFailed = true;
        return null;
      }
      // Le run meurt AVANT le premier outil : c'est le cas dominant en production
      // (17 % des boucles, 1,0 tour, 0 appel). Le code borné dit enfin de quoi.
      emitLoopSummary("error", sendErrorReason(err));
      throw err;
    } finally {
      clearInterval(tick);
    }
  };

  // Grows as the loop makes forward progress (see BASE_TURNS/TURNS_PER_PROGRESS).
  // The condition re-reads it each iteration, so a productive turn extends the run.
  dbg({
    type: "phase",
    scope: "loop",
    label: "Boucle MCP démarrée",
    // Les TROIS chiffres du journal doivent se réconcilier. Le 27/07/2026 il fallait
    // deviner que « 0/296 » (pick routeur) + « 2/296 outils » (après rattrapage) + « 7
    // outils offerts » (au modèle) parlaient de la même chose : les 5 outils INTERNES
    // (load_tools, run_python, memory_search, web_fetch_many, suggest_integrations) ne
    // sont pas des outils connecteur et n'apparaissaient nulle part dans le compte.
    detail:
      `${selected.length}/${mcpTools.length} outil${mcpTools.length > 1 ? "s" : ""} connecteur` +
      `${toolDefs.length - selected.length ? ` + ${toolDefs.length - selected.length} interne${toolDefs.length - selected.length > 1 ? "s" : ""}` : ""}` +
      ` = ${toolDefs.length} offert${toolDefs.length > 1 ? "s" : ""} · ${p.modelId}`,
  });
  let turnBudget = BASE_TURNS;
  // Consecutive non-productive tool outcomes (errors / dead-ends / declines / failed
  // run_python), across all tools. Reset by any productive call; hard-stops the loop
  // when it can't advance (see MAX_CONSECUTIVE_DEAD). Guarantees termination even for
  // the paths that skip the content-keyed stuck guard.
  let deadStreak = 0;
  let deadTurn = -1; // response index of the LAST counted dead — a batch counts ONCE
  const bumpDead = (): number => (deadTurn === currentTurn ? deadStreak : ((deadTurn = currentTurn), ++deadStreak));
  // Consecutive run_python TIMEOUT/network failures. A sandbox whose network is
  // unreachable (yfinance/Yahoo down) never recovers, and each attempt burns the full
  // ~60 s jail budget — the reported 3×60 s loop. Reset by any run_python that runs;
  // hard-stops sooner than the generic dead-streak (see the run_python block).
  let pyTimeoutStreak = 0;
  // Stop the loop early with the standard exhaustion diagnosis (no more turns wasted
  // on a proven-unproductive run). Caller pushes the current tool message first.
  const finishExhausted = (hammered?: { tool: string; web: boolean }): boolean => {
    checkpointTranscript(); // an early exit mid-batch still records the turn's real state
    struggle.emit();
    p.onText(
      p.fromWire(
        exhaustionMessage({ callCounts, repeatedResult, argErrored, succeeded, maxTurns: turnBudget, stopped: "stuck", hammered, repeatedFailure }),
      ),
      false,
    );
    emitUsage();
    emitLoopSummary("exhausted");
    return true;
  };
  for (let turn = 0; turn < turnBudget; turn++) {
    currentTurn = turn;
    if (aborted()) return finalizeAborted();
    let res: ToolsResult | null;
    try {
      res = await callModel(false);
    } catch (err) {
      // A STALL (TTFT or the non-streamed hard budget) gets ONE soft retry — an
      // overloaded free tier routinely answers on the second attempt. A retry that
      // fails re-throws the ORIGINAL stall so the store's error copy stays truthful.
      const stalled = err instanceof Error && err.message === MODEL_STALL_ERROR;
      if (!stalled || stallRetryDone) throw err;
      stallRetryDone = true;
      softCallFailed = false;
      const retry = await callModel(false, true);
      if (!retry) {
        if (!softCallFailed) return finalizeAborted();
        throw err;
      }
      res = retry;
    }
    if (!res) return finalizeAborted();

    if (res.toolCalls.length === 0) {
      // Auto-retry ONCE on a completely EMPTY turn (no text, no tool call): the free
      // tiers routinely return a zero-token completion under load, and it used to fall
      // straight through to « aucune réponse » — the DOMINANT failure class measured by
      // the workflow evals (soft: a failed retry keeps the empty answer path, only a
      // genuine Stop finalizes as interrupted).
      if (!emptyRetryDone && !res.text.trim()) {
        emptyRetryDone = true;
        softCallFailed = false;
        const retry = await callModel(false, true);
        if (retry) res = retry;
        else if (!softCallFailed) return finalizeAborted();
      }
    }

    if (res.toolCalls.length === 0) {
      // Auto-retry ONCE with a FORCED tool call: a weak model (GPT-4o mini…) that
      // declined in prose while tools were available usually complies when it's
      // required to call one. Only when nothing was called yet and it looks like
      // a refusal, so a genuine conversational answer isn't hijacked.
      //
      // OPPORTUNISTIC (soft): the retry is a bonus, never a requirement — we
      // already have a prose answer. If tool_choice=required fails (some providers
      // reject it — certains paliers gratuits 400 dessus), keep that answer instead of
      // failing the whole turn. Only a genuine Stop (abort → not softCallFailed)
      // finalizes as interrupted.
      // …et seulement s'il reste un outil SANS effet de bord à proposer : forcer un appel
      // alors que le seul choix possible écrit, c'est fabriquer l'effet de bord soi-même.
      // …ou une réponse FABRIQUÉE — connecteur NOMMÉ + zéro appel : le modèle invente
      // des données plausibles au lieu de refuser (pourquoi : `namesConnectedConnector`).
      const fabricated = namesConnectedConnector(requestText, connectedIds);
      if (!anyToolCall && !forcedRetryDone && (looksLikeRefusal(res.text) || fabricated) && readOnlyToolDefs().length) {
        forcedRetryDone = true;
        softCallFailed = false;
        const retry = await callModel(true, true);
        if (retry) res = retry;
        else if (!softCallFailed) return finalizeAborted();
        // else: the forced retry couldn't run — fall through with the original `res`.
      }
    }

    if (res.toolCalls.length === 0) {
      // Final answer with no (recovered) tool call → if the model kept malforming
      // a tool and gave up, flag it as likely too limited for that tool.
      struggle.emit();
      // …or it never called a tool at all AND declined in prose while tools were
      // available (even when forced): surface the "try a more capable model" hint.
      if (!anyToolCall && (looksLikeRefusal(res.text) || namesConnectedConnector(requestText, connectedIds))) struggle.reportNoToolUsed();
      // The turn is over and the REQUEST named a service that isn't connected: propose it
      // ourselves, since a weak model never calls `suggest_integrations` (it improvises,
      // then asks in prose). Skipped when the model suggested something itself.
      if (!suggested && suggestCandidates.length) {
        const wanted = connectorsForRequest(requestText, suggestCandidates, alreadyConnected);
        if (wanted.length) p.onSuggestIntegrations?.(wanted.map((c) => c.id));
      }
      // Never leave a blank bubble: a model that returns neither text nor a tool
      // call (e.g. Gemini malforming a call, a blocked/empty reply) would just
      // "stop with no message" — show a fallback so the turn is legible.
      const finalText = res.text.trim()
        ? p.fromWire(res.text)
        : p.fromWire("_(Le modèle n'a renvoyé aucune réponse. Réessayez ou changez de modèle.)_");
      p.onText(finalText, false);
      emitUsage();
      emitLoopSummary("answered");
      return true;
    }
    anyToolCall = true;
    if (res.rateLimit) p.onQuotaLeft?.(res.rateLimit);
    soloRead = advanceSoloRead(soloRead, res.toolCalls); // reading target by target?

    // Record the assistant's tool-calling turn (wire form: placeholders).
    messages.push({ role: "assistant", content: res.text, toolCalls: res.toolCalls });
    if (res.text.trim()) {
      lastText = p.fromWire(res.text);
      p.onText(lastText, true);
    }

    // ⚠️ CANONICALISER CHAQUE NOM UNE FOIS, AVANT TOUTE DÉCISION — prefetch compris :
    // la boucle keye TOUT sur le nom écrit par le modèle (connecteur, politique de
    // résultat, mode clair, caps, idempotence), et le recalage vivait DANS le chemin
    // séquentiel — le prefetch décidait encore sur le nom nu (audit 2026-08-10). Les
    // méta-outils interceptés sont EXCLUS (`INTERCEPTED_META_TOOLS`, voir sa doc).
    for (const call of res.toolCalls) {
      if (!INTERCEPTED_META_TOOLS.has(call.name))
        call.name = canonicalToolName(call.name, fullByName.keys());
    }

    // Les lectures de ce tour partent en parallèle, par vagues bornées par le contexte —
    // sélection, garanties et budget : `prefetch.ts`.
    const prefetch = new Map<string, ReturnType<typeof client.callTool>>();
    if (res.toolCalls.length > 1) {
      await prefetchReads({
        calls: res.toolCalls,
        callCounts,
        toolInfo,
        vaultTerms: p.vault ? [...Object.keys(p.vault), ...Object.values(p.vault)] : [],
        deredact: (args) => deredactArgs(args, p.fromWireArgs ?? p.fromWire) as Record<string, unknown>,
        budget: charBudget,
        used: usedChars,
        dispatch: (call) => {
          const pr = raceAbort(
            client.callTool(
              { id: call.id, name: call.name, arguments: call.arguments as McpToolCall["arguments"] },
              // A prefetched call dispatches BEFORE the sequential gates, so the
              // clear-mode decision must ride along here too — same predicate as the
              // sequential path, so the two can't disagree on the same call.
              navClearOpts(call.name, (call.arguments ?? {}) as Record<string, unknown>),
            ),
            p.signal,
          );
          // Attach a no-op catch so a prefetch that rejects AFTER the loop already
          // returned early (Stop / STUCK_STOP / deadStreak) doesn't surface as an
          // unhandled rejection. The awaiting site below still sees the real rejection.
          pr.catch(() => {});
          prefetch.set(call.id, pr);
          return pr;
        },
      });
    }

    // Intra-turn DEDUP: models (Nemotron, Gemma — measured) sometimes emit the SAME
    // call twice in one turn. For a READ it's wasted latency; for a WRITE it's a real
    // double side-effect (two Asana tasks) hiding behind two identical confirms. The
    // first occurrence runs; duplicates get a pointer result, no dispatch, no gate.
    const seenThisTurn = new Map<string, string>();
    for (const call of res.toolCalls) {
      // Stop pressed between tool calls (a long call still runs to completion —
      // mcp:callTool has no cancel channel — but no further calls are issued).
      if (aborted()) return finalizeAborted();
      const dupKey = `${call.name}::${JSON.stringify(call.arguments ?? {})}`;
      if (!call.argsError && seenThisTurn.has(dupKey)) {
        dbg({ type: "tool", vault: p.vault, kinds: p.kinds, name: call.name, ok: true, args: safeJson(call.arguments), result: "(dédupliqué)" });
        messages.push({
          role: "tool",
          toolCallId: call.id,
          content: "Appel identique au précédent dans ce même tour — dédupliqué : réutilise le résultat déjà renvoyé, ne le répète pas.",
        });
        continue;
      }
      seenThisTurn.set(dupKey, call.id ?? "");
      p.onToolCall(call.name);
      loopStats.toolCalls += 1;
      const args = (call.arguments ?? {}) as Record<string, unknown>;

      // Internal meta-tool: load more tool SCHEMAS on demand. Never proxied to an
      // MCP server — it just grows the callable set (toolDefs/toolInfo) from the
      // full connected surface, within the context budget.
      if (call.name === "load_tools") {
        p.onToolProgress?.("Choix des bons outils"); // intercepted — narrate like any call
        const { add, content: loadMsg } = resolveLoadTools(
          args.tool_names,
          fullByName,
          toolInfo,
          win * 0.85,
        );
        for (const t of add) {
          toolInfo.set(t.name, t);
          toolDefs.push(toolDefOf(t));
        }
        // « Inconnus : » is the exact marker `resolveLoadTools` emits for a name that
        // matches no connector/tool (pinned by toolCatalog.test.ts) — count the
        // hallucinations for the loop summary, never the invented name itself.
        if (loadMsg.includes("Inconnus :")) loopStats.loadToolsUnknown += 1;
        dbg({ type: "tool", vault: p.vault, kinds: p.kinds, name: "load_tools", ok: true, args: safeJson(call.arguments), result: loadMsg });
        messages.push({ role: "tool", toolCallId: call.id, content: loadMsg });
        continue;
      }

      // Intercepted: pin the connectors on the message so the bubble renders clickable
      // connect cards. Ids validated against the not-connected set (`resolveSuggestCall`).
      if (call.name === "suggest_integrations") {
        p.onToolProgress?.("Recherche d'une intégration"); // intercepted — narrate like any call
        const { ids, message: sugMsg } = resolveSuggestCall(args.integration_ids, suggestCandidates);
        if (ids.length) {
          suggested = true;
          p.onSuggestIntegrations?.(ids);
        }
        dbg({ type: "tool", vault: p.vault, kinds: p.kinds, name: "suggest_integrations", ok: ids.length > 0, args: safeJson(call.arguments), result: sugMsg });
        messages.push({ role: "tool", toolCallId: call.id, content: sugMsg });
        continue;
      }

      // Code interpreter: run model-generated Python in the sandbox. Intercepted —
      // NEVER proxied to an MCP server, no write-confirmation (compute-only, no
      // external side effects). Each figure is shown inline to the user via onPythonImage.
      // The model WROTE the code with FAKES, but the sandbox is LOCAL (the user's machine,
      // the user's own data) with egress locked to a tiny allow-list — so we DE-REDACT the
      // code before running it, so the DELIVERABLES (PDF/xlsx/docx) + inline figures carry
      // the user's REAL data (the core "you get your real data back" promise). The EXTERNAL
      // model still only ever sees FAKES: the stdout is RE-REDACTED (real→fakes, reversible
      // via the same vault) below before it goes back into the conversation.
      if (call.name === "run_python" && p.runPython) {
        const code = p.fromWire(typeof args.code === "string" ? args.code : "");
        // Un `code` ABSENT ou VIDE ne s'exécute pas : mesuré en éval (ling), un modèle
        // émet `run_python({})` en boucle — exécuter du vide renvoie un succès muet que
        // le modèle ré-émet à l'identique (5 tours perdus). Erreur EXPLICITE + streak.
        if (!code.trim()) {
          argErrored.add("run_python");
          const emptyMsg =
            "Erreur : l'argument `code` est manquant ou vide — RIEN n'a été exécuté. " +
            "Renvoie l'appel `run_python` avec le script Python COMPLET dans le champ `code` (une seule chaîne JSON valide). " +
            "Si ton exécution précédente a déjà produit le résultat (figure affichée, sortie correcte), ne relance rien : présente la réponse.";
          dbg({ type: "tool", vault: p.vault, kinds: p.kinds, name: "run_python", ok: false, args: safeJson(call.arguments, 400), result: emptyMsg, error: "code vide" });
          p.onToolResult?.({ tool: "run_python", server: "python", ok: false });
          messages.push({ role: "tool", toolCallId: call.id, content: emptyMsg });
          if (bumpDead() >= MAX_CONSECUTIVE_DEAD) return finishExhausted();
          continue;
        }
        let r: {
          ok: boolean;
          stdout: string;
          stderr: string;
          images: { name: string; base64: string }[];
          files: { name: string; base64: string; mime: string }[];
        };
        // The interpreter is the LONGEST dead air of any tool (the jail allows 60 s)
        // and it bypasses the dispatch path where every other call gets its live
        // narration — seed + tick here too, so the trace row breathes the whole run.
        // The 90 s watchdog sits ABOVE the jail's own 60 s kill: it exists for the
        // ticks and only ever fires if the jail itself hung.
        p.onToolProgress?.(toolStartNarration("run_python", "python"));
        const tPy = Date.now();
        try {
          r = await raceAbort(
            watchToolCall(p.runPython(code), {
              bareTool: "run_python",
              timeoutMs: 90_000,
              onTick: (elapsed) => {
                if (!aborted())
                  p.onToolProgress?.(
                    liveToolStatus(toolStartNarration("run_python", "python"), elapsed, 90_000),
                  );
              },
            }),
            p.signal,
          );
        } catch (e) {
          if (aborted() || isAbortError(e)) return finalizeAborted();
          r = { ok: false, stdout: "", stderr: e instanceof Error ? e.message : String(e), images: [], files: [] };
        }
        if (aborted()) return finalizeAborted();
        // Delivery is COUNTED, not assumed: a failed save must not let the model tell
        // the user « fichier remis » about a deliverable that exists nowhere (audit —
        // the note below used to announce r.files/r.images unconditionally while the
        // catch swallowed the failure). The turn still never breaks on a failed save.
        const deliveredImages: typeof r.images = [];
        const deliveredFiles: typeof r.files = [];
        const failedDeliveries: string[] = [];
        for (const img of r.images) {
          try {
            await p.onPythonImage?.(img);
            deliveredImages.push(img);
          } catch {
            failedDeliveries.push(img.name);
          }
        }
        for (const file of r.files) {
          try {
            await p.onPythonFile?.(file);
            deliveredFiles.push(file);
          } catch {
            failedDeliveries.push(file.name);
          }
        }
        if (r.ok) {
          // Keep the SUCCESSFUL script as the turn's working script (WIRE form —
          // `args.code` is what the model wrote, fakes only; the de-redacted `code`
          // never leaves the sandbox path). Feeds cross-turn iteration.
          try {
            await p.onPythonScript?.(typeof args.code === "string" ? args.code : "");
          } catch {
            /* best-effort — never break the turn */
          }
        }
        let content = r.stdout.trim();
        if (deliveredImages.length) {
          content += (content ? "\n\n" : "") + `[${deliveredImages.length} figure(s) générée(s) et affichée(s) à l'utilisateur — le résultat est définitif, ne relance pas ce code : présente la réponse.]`;
        }
        if (deliveredFiles.length) {
          content +=
            (content ? "\n\n" : "") +
            `[${deliveredFiles.length} fichier(s) remis à l'utilisateur : ${deliveredFiles.map((f) => f.name).join(", ")}.]`;
        }
        if (failedDeliveries.length) {
          // Honest failure (règle maison) : the deliverable was produced but could NOT
          // be handed over — the model must say so, not present a phantom file.
          content +=
            (content ? "\n\n" : "") +
            `[ÉCHEC de remise à l'utilisateur : ${failedDeliveries.join(", ")} — ce(s) fichier(s) ` +
            `n'ont PAS pu être enregistrés. Dis-le à l'utilisateur et propose de réessayer.]`;
        }
        if (!r.ok) {
          // Bounded telemetry: the failure CLASS + duration, never code/stdout/stderr.
          captureEvent({ name: "run_python_failed", reason: pythonFailReason(r.stderr), ms: Date.now() - tPy, loopId });
        }
        if (!r.ok && r.stderr.trim()) {
          content += (content ? "\n\n" : "") + `Erreur d'exécution :\n${r.stderr.trim().slice(0, 4000)}`;
          // PRÉCISION on a package/install error so the model course-corrects instead of
          // looping (it kept trying `pip install` / another lib). State plainly that
          // installing is impossible and which packages ARE available.
          const hint = pythonErrorHint(r.stderr, { browser: hasBrowser, fetchMany: !!p.fetchMany });
          if (hint) content += `\n\n${hint}`;
          // Une erreur de CODE (pas de réseau/timeout — là, réessayer est proscrit) se
          // corrige par ITÉRATION : mesuré en éval, un modèle repart de zéro et perd
          // le travail déjà bon — le steer explicite vers « modifie et renvoie ENTIER ».
          if (pythonFailReason(r.stderr) === "runtime" || pythonFailReason(r.stderr) === "module") {
            content += "\n\nCorrige le script ci-dessus (garde ce qui marchait, change ce qui a échoué) et renvoie-le EN ENTIER dans un nouvel appel `run_python` — jamais un fragment.";
          }
        }
        if (!content) content = r.ok ? "(exécuté — aucune sortie)" : "Échec de l'exécution.";
        // The code ran DE-REDACTED, so stdout/stderr + the delivered filenames now hold
        // REAL values — RE-REDACTEDR them (real→fakes, reversible via the SAME vault, so a
        // known value reuses its canonical fake) before the model sees any of it. The
        // deliverable FILES keep their real data (already saved above); only the
        // model-facing text is scrubbed. No-op on the static labels/error hints.
        // FAIL-CLOSED (audit): the sandbox ran on REAL data, so stdout is real PII — never
        // send it raw. Mask when no redactor is wired (the MCP-result path defaults to regex;
        // this one had no fallback → a caller wiring runPython without redactResult leaked).
        content = redactResult
          ? await redactResult(content, p.vault, "run_python")
          : "(sortie masquée : redaction indisponible)";
        if (aborted()) return finalizeAborted();
        // The journal entry keeps its DIAGNOSTICS on failure: the (re-redacted) stdout +
        // stderr ride `result` (rendered even when ok=false), `error` carries the shape
        // metadata (duration, stderr size). The CODE is the key debugging artifact, so
        // it gets a much larger cap than a generic tool's args.
        dbg({
          type: "tool", vault: p.vault, kinds: p.kinds, name: "run_python", ok: r.ok,
          args: safeJson(call.arguments, 4000), result: content,
          ...(r.ok
            ? {}
            : {
                error: `échec en ${Date.now() - tPy} ms · stderr ${r.stderr.trim().length} car. (re-redacted ci-dessous)${r.stdout.trim() ? ` · stdout ${r.stdout.trim().length} car.` : ""}`,
              }),
        });
        p.onToolResult?.({
          tool: "run_python",
          server: "python",
          ok: r.ok,
          summary:
            [r.images.length && `${r.images.length} figure(s)`, r.files.length && `${r.files.length} fichier(s)`]
              .filter(Boolean)
              .join(" · ") || undefined,
        });
        messages.push({ role: "tool", toolCallId: call.id, content });
        // Repeated run_python failures otherwise loop until the turn cap (each can
        // be slow) — count them toward the dead-streak backstop.
        if (r.ok) {
          deadStreak = 0;
          pyTimeoutStreak = 0;
        } else {
          // A TIMEOUT/network failure means the sandbox can't reach what the code needs;
          // retrying burns another ~60 s for nothing, so stop after the 2nd in a row
          // (the model got a "ne réessaie pas" hint on the 1st — see pythonErrorHint).
          const reason = pythonFailReason(r.stderr);
          pyTimeoutStreak = reason === "timeout" || reason === "network" ? pyTimeoutStreak + 1 : 0;
          if (pyTimeoutStreak >= 2) return finishExhausted();
          if (bumpDead() >= MAX_CONSECUTIVE_DEAD) return finishExhausted();
        }
        continue;
      }

      if (call.name === "memory_search" && p.searchMemory) {
        // Rule 11 by hand: the model asked with FAKES; the store holds REAL values —
        // un-redact the query exactly like the client would an outgoing arg (encoded
        // forms included), then re-redact the result through the SAME vault.
        const query = wireArg(typeof args.query === "string" ? args.query : "");
        let found = "";
        try {
          found = (await raceAbort(Promise.resolve(p.searchMemory(query)), p.signal)) ?? "";
        } catch (e) {
          if (aborted() || isAbortError(e)) return finalizeAborted();
          found = "";
        }
        let content: string;
        if (found) {
          content = redactResult
            ? await redactResult(`Souvenirs correspondants :\n${found}`, p.vault, "memory_search")
            : "(résultat masqué : redaction indisponible)"; // fail-closed, like run_python
        } else {
          content = "Aucun souvenir correspondant dans la mémoire de l'utilisateur.";
        }
        if (aborted()) return finalizeAborted();
        dbg({ type: "tool", vault: p.vault, kinds: p.kinds, name: "memory_search", ok: true, args: safeJson(call.arguments), result: content });
        p.onToolResult?.({ tool: "memory_search", server: "memoire", ok: true, summary: found ? undefined : "aucun résultat" });
        messages.push({ role: "tool", toolCallId: call.id, content });
        deadStreak = 0; // the lookup SUCCEEDED either way — an empty store is an answer
        continue;
      }

      if (call.name === "web_fetch_many" && p.fetchMany) {
        // The model holds FAKES; un-redact each URL (fake→real, encoded forms) so the
        // fetch hits the REAL page — then re-redact every returned string below.
        const rawUrls = Array.isArray(args.urls) ? args.urls.filter((u): u is string => typeof u === "string") : [];
        const reals = p.vault ? Object.values(p.vault) : [];
        const placeValues = p.kinds ? reals.filter((v) => p.kinds?.[v] === "location") : [];
        const accepted: string[] = [];
        const refused: { url: string; reason: string }[] = [];
        for (const raw of rawUrls) {
          const url = wireArg(raw);
          // The SAME URL backstops as `browser_navigate` — but there is NO confirm card
          // here (a read tool), so a flagged URL is DROPPED (fail-closed), not confirmed.
          const navFake = fakeDerivedNavHost(url, p.vault ?? {});
          if (navFake) {
            refused.push({ url, reason: `domaine dérivé d'un pseudonyme (${navFake.host}) — pas le site réel` });
            continue;
          }
          if (p.browserAllowedDomains?.length && !domainAllowed(p.browserAllowedDomains, url)) {
            refused.push({ url, reason: "domaine hors de la liste autorisée" });
            continue;
          }
          // A URL embedding conversation data / an encoded blob is exfiltration (a real
          // value in a real search box on a search host is exempt — that's the search).
          if (analyzeNavExfil(url, reals, placeValues).suspicious) {
            refused.push({ url, reason: "URL porteuse de données de conversation (exfiltration bloquée)" });
            continue;
          }
          accepted.push(url);
        }
        p.onToolProgress?.(toolStartNarration("web_fetch_many", "web"));
        let items: WebFetchItem[] = [];
        if (accepted.length) {
          // Same confirmation-policy fact as the proxied dispatch above: an intercepted
          // batch fetch is web ingress too. Only when something actually leaves.
          if (p.convId) recordWebSearch(p.convId);
          try {
            items = await raceAbort(Promise.resolve(p.fetchMany(accepted)), p.signal);
          } catch (e) {
            if (aborted() || isAbortError(e)) return finalizeAborted();
            items = accepted.map((url) => ({ url, ok: false, error: "échec de récupération" }));
          }
        }
        if (aborted()) return finalizeAborted();
        // ONE text block, per-URL sections — re-redacted as a whole (real→fakes, same
        // vault; BROWSER_CLEAR keeps place/org in clear). The real URLs in the headers
        // go through the redactor too, so no real value reaches the model.
        const sections = [
          ...items.map((it) =>
            it.ok ? `## ${it.finalUrl ?? it.url}\n${it.text ?? ""}` : `## ${it.url}\n[échec : ${it.error ?? "inconnu"}]`,
          ),
          ...refused.map((r) => `## ${r.url}\n[refusé : ${r.reason}]`),
        ];
        let content = sections.join("\n\n---\n\n") || "Aucune URL exploitable fournie.";
        // FAIL-CLOSED (like run_python): the pages are untrusted web text — never send
        // raw, mask when no redactor is wired. But the SAME clear-mode decision as the
        // browser applies first (rule 9): a fetch whose URLs carry NO redacted data is
        // public content — replay the vault (echoed fakes stay stable, Coffre/credential
        // spans escalate fail-closed) instead of minting fakes for a public front page.
        content = redactResult
          ? await (navClearOpts("web_fetch_many", args)?.redactText(content, p.vault) ??
              redactResult(content, p.vault, "web_fetch_many"))
          : "(résultats masqués : redaction indisponible)";
        if (aborted()) return finalizeAborted();
        const okCount = items.filter((i) => i.ok).length;
        dbg({
          type: "tool", vault: p.vault, kinds: p.kinds, name: "web_fetch_many", ok: okCount > 0,
          args: safeJson(call.arguments), result: content,
          ...(okCount > 0 ? {} : { error: `${accepted.length} tentée(s), ${refused.length} refusée(s), 0 réussie(s)` }),
        });
        p.onToolResult?.({
          tool: "web_fetch_many", server: "web", ok: okCount > 0,
          summary: `${okCount}/${accepted.length + refused.length} page(s)`,
        });
        messages.push({ role: "tool", toolCallId: call.id, content });
        // A batch that read at least one page is progress; an all-fail batch counts
        // toward the dead-streak backstop so a bad-URL loop can't run to the turn cap.
        if (okCount > 0) deadStreak = 0;
        else if (bumpDead() >= MAX_CONSECUTIVE_DEAD) return finishExhausted();
        continue;
      }

      // Le nom est déjà canonique : la passe UNIQUE tourne en tête de réponse, avant le
      // prefetch (voir le bloc au-dessus de `prefetchReads`) — plus de re-calage ici.
      const server = serverOf(call.name);
      // Trace fields: connector = the name prefix before "__", bare tool = the rest.
      const px = call.name.indexOf("__");
      const connectorId = px > 0 ? call.name.slice(0, px) : server;
      const bareTool = px > 0 ? call.name.slice(px + 2) : call.name;
      // Privacy-safe: names/ids only — never the arguments.
      captureEvent({ name: "tool_called", server, tool: call.name, connector: connectorId, provider: p.provider, model: p.modelId, loopId });
      // Au cap per-tool : REFUSÉ sans dispatch ni compte (prefetch sauté ; `callCounts` =
      // EXÉCUTÉS), sommé de conclure ; `finishExhausted` seulement s'il INSISTE ensuite.
      if (usedChars() >= charBudget) {
        messages.push({ role: "tool", toolCallId: call.id, content: contextBudgetNote(call.name) });
        dbg({ type: "tool", vault: p.vault, kinds: p.kinds, name: call.name, ok: false, args: safeJson(call.arguments), error: `budget de contexte atteint (${charBudget} car.) — appel non dispatché` });
        if (budgetNotedTurn >= 0 && budgetNotedTurn < turn)
          return finishExhausted({ tool: call.name, web: isGovernedWebTool(call.name) });
        budgetNotedTurn = turn;
        continue;
      }
      const capMax = maxSameToolCalls(call.name, isConfidentReadOnly(call.name, toolInfo.get(call.name)));
      if ((callCounts.get(call.name) ?? 0) >= capMax) {
        messages.push({ role: "tool", toolCallId: call.id, content: capRefusalNote(call.name, capMax) });
        dbg({ type: "tool", vault: p.vault, kinds: p.kinds, name: call.name, ok: false, args: safeJson(call.arguments), error: `cap per-tool atteint (${capMax}) — appel non dispatché` });
        if ((capNotedTurn.get(call.name) ?? turn) < turn)
          return finishExhausted({ tool: call.name, web: isGovernedWebTool(call.name) });
        capNotedTurn.set(call.name, turn);
        continue;
      }
      callCounts.set(call.name, (callCounts.get(call.name) ?? 0) + 1);
      let content: string;
      let reason: ToolErrorReason | undefined;
      let trueUnknown = false; // le vrai verdict quand la relance a coercé `unknown`
      // The RAW error text (before redaction masks it) — used ONLY to pattern-match
      // an agent-browser backend fault below. Never surfaced to the model (the fixed
      // BROWSER_BACKEND_FAULT_MESSAGE is), so matching the raw string leaks nothing.
      let toolErrRaw = "";
      let resultSummary: string | undefined;
      // Parallel human NARRATION of this call (small model, wire-safe redacted args):
      // shown live during the round-trip + persisted on the trace. `callSettled` gates
      // the LIVE update so a summary landing after the tool finished can't flash stale
      // text on the next step; `progressNote` (set when it resolves) rides onToolResult.
      let progressNote: string | undefined;
      let callSettled = false;
      let progressP: Promise<void> | null = null;
      // Round-trip duration, set at settle (success OR throw) — persisted on the
      // trace row via onToolResult so the finished trace shows where time went.
      let tCall = 0;
      let callMs: number | undefined;
      // Hoistée hors du `try` : le `catch` doit pouvoir CLORE la ligne du journal, sinon
      // un appel qui échoue (ou un Stop) la laisse à jamais sur son « en cours… ».
      let callPhase = "";

      // Parsability gate: the model emitted a tool call whose raw arguments were
      // NOT valid JSON (OpenAI-compat path surfaces this as `argsError`). Never
      // send a silently-emptied `{}` to the server — hand the parse error back
      // with the expected schema so the model re-emits valid JSON, exactly like
      // an arg_error. Definitive "the model malformed this call", no server hit.
      if (call.argsError) {
        content =
          `Tool error: les arguments de l'appel n'étaient pas un JSON valide (${call.argsError}). ` +
          `Renvoie un objet JSON strictement valide et conforme au schéma, puis réessaie.`;
        reason = "arg_error";
        argErrored.add(call.name);
        const attempt = (argErrorCount.get(call.name) ?? 0) + 1;
        argErrorCount.set(call.name, attempt);
        content += argErrorHint(call.name, toolInfo.get(call.name)?.inputSchema, attempt);
        captureEvent({ name: "tool_error", server, tool: call.name, reason, connector: connectorId, provider: p.provider, model: p.modelId, attempt, loopId });
        dbg({ type: "tool", vault: p.vault, kinds: p.kinds, name: call.name, ok: false, args: safeJson(call.arguments), error: content });
        p.onToolResult?.({ tool: bareTool, server: connectorId, ok: false });
        messages.push({ role: "tool", toolCallId: call.id, content });
        if (bumpDead() >= MAX_CONSECUTIVE_DEAD) return finishExhausted();
        continue;
      }

      // Appel AVEUGLE au schéma (réel, jamais chargé, args inventés) : le schéma s'enregistre
      // d'abord ; rejet SEULEMENT sur violation prouvable — `schemaBlind.ts` porte les raisons.
      if (!toolInfo.has(call.name) && fullByName.has(call.name)) {
        const full = fullByName.get(call.name)!;
        toolInfo.set(call.name, full);
        toolDefs.push(toolDefOf(full));
        const { problems, param: blindParam } = schemaBlindProblems(full.inputSchema, args);
        captureEvent({ name: "tool_schema_blind", server, tool: call.name, verdict: problems.length ? "bounced" : "dispatched", provider: p.provider, model: p.modelId, loopId });
        if (problems.length) {
          reason = "arg_error";
          argErrored.add(call.name);
          const attempt = (argErrorCount.get(call.name) ?? 0) + 1;
          argErrorCount.set(call.name, attempt);
          content =
            `Tool error: appel envoyé sans avoir chargé le schéma de \`${call.name}\`, et les arguments ne le respectent pas — ${problems.join(" ; ")}. RIEN n'a été envoyé au service.` +
            argErrorHint(call.name, full.inputSchema, attempt);
          captureEvent({ name: "tool_error", server, tool: call.name, reason, connector: connectorId, provider: p.provider, model: p.modelId, attempt, ...(blindParam ? { param: blindParam } : {}), loopId });
          dbg({ type: "tool", vault: p.vault, kinds: p.kinds, name: call.name, ok: false, args: safeJson(call.arguments), error: content });
          p.onToolResult?.({ tool: bareTool, server: connectorId, ok: false });
          messages.push({ role: "tool", toolCallId: call.id, content });
          if (bumpDead() >= MAX_CONSECUTIVE_DEAD) return finishExhausted();
          continue;
        }
      }
      // Pre-validate: a required arg that's absent/empty is a definitive
      // "the model malformed this call" — hand back a clear error WITHOUT hitting
      // the server, so a capable model retries with valid values.
      const missing = missingRequired(toolInfo.get(call.name)?.inputSchema, args);
      // Domain allow-list gate (agent-browser hardening): the model may only
      // NAVIGATE to allow-listed domains (empty list = unrestricted). Blocked before
      // the write-confirm — no point confirming a navigation we won't run. The human
      // URL bar (browser:navigate) is a separate path and is NOT restricted.
      // Compute the (un-redacted) args ONCE, reused by the domain allow-list check, the
      // nav-exfil decision, and the H-4 arg-exfil scan below.
      const deredactedArgs = !missing.length
        ? (deredactArgs(args, p.fromWireArgs ?? p.fromWire) as Record<string, unknown>)
        : {};
      // The URL a navigation would load — browser_navigate OR browser_tabs (action:"new"),
      // on ANY connector (audit ELEC-2 + the third-party-browser gap): all must pass the
      // domain allow-list AND the nav-exfil scan.
      const navUrl = browserNavUrl(call.name, deredactedArgs);
      // ⚠️ The scan triggers on "this call carries a model-chosen URL", NOT on the tool's
      // NAME — naming must never confer capability, so the URL itself is the trigger.
      // Keying it on `isBrowserNavigate` (connector === "browser" && bare ===
      // "browser_navigate") left two shapes with ZERO scan: `browser_tabs` (`isSearchTool`
      // then skipped the arg scan too) and every third-party browser. Now that every
      // connector dispatches REAL values, this scan is the backstop that actually carries
      // weight — there is no un-redaction gate behind it any more.
      const isNav = !!navUrl;
      let navBlocked = false;
      let navHost = "";
      if (navUrl && p.browserAllowedDomains?.length && !domainAllowed(p.browserAllowedDomains, navUrl)) {
        navBlocked = true;
        try {
          navHost = new URL(navUrl).hostname;
        } catch {
          navHost = navUrl;
        }
      }
      // Idempotency (retry-safety, Option A): a side-effecting call gets a stable key
      // from (turnId, tool, WIRE args). If the SAME write already completed in this turn
      // — the common case being a "Réessayer" after a mid-turn failure — the ledger holds
      // its key, and we SKIP both the confirm and the real dispatch below (the model is
      // told it's already done). Keyed on the WIRE fakes: stable across the retry (same
      // vault) and PII-free. Reads are never keyed.
      const info = toolInfo.get(call.name);
      const isWrite = isWriteTool(call.name, info?.description, info?.annotations);
      const idemKey = isWrite && p.turnId ? writeKey(p.turnId, call.name, args) : null;
      const alreadyDone = !!idemKey && !!p.writeLedgerHas?.(idemKey);
      // COMPORTEMENT, pas confirmation : « Rédige un email à X » n'est PAS « envoie un
      // email à X ». Un modèle faible saute directement à `send_email` sur une simple
      // demande de RÉDACTION (journal 2026-07-26 : email parti sur-le-champ, aucune
      // carte en mode standard). Quand le DERNIER message utilisateur demande de
      // rédiger/préparer une communication SANS verbe d'envoi, tout outil d'ENVOI est
      // refusé DÉTERMINISTIQUEMENT et le modèle est orienté vers un brouillon dans la
      // conversation — l'envoi n'a lieu que sur demande explicite (« envoie-le »), qui
      // porte un verbe d'envoi et rouvre la porte au tour suivant.
      const lastUserText =
        [...p.history].reverse().find((m) => m.role === "user")?.content ?? "";
      const draftOnly =
        isWrite &&
        isCommSendTool(bareTool) &&
        isDraftOnlyIntent(typeof lastUserText === "string" ? lastUserText : "");
      // Même famille, un cran plus large : « CONSULTER » n'est pas « AGIR ». Journal du
      // 27/07/2026 — « Prépare ma journée : mes rendez-vous dans l'ordre » et le modèle,
      // sans avoir LU l'agenda une seule fois, a créé un événement inventé (participants
      // et salle compris) dans l'agenda réel. La confirmation ne le rattrape pas : en
      // mode `standard` (le défaut) `CONFIRMATION_POLICY` n'ouvre AUCUNE carte pour une
      // écriture ordinaire tant que la conversation n'a pas touché le web — la création
      // partait sans que rien ne s'affiche. Quand le dernier message ne demandait qu'à
      // consulter, toute écriture est donc refusée ICI, quel que soit le mode.
      //
      // Les deux exemptions (navigateur, écriture AMBIGUË) sont dans `refusedAsConsultOnly`.
      const consultOnly = refusedAsConsultOnly(
        call.name,
        isWrite,
        typeof lastUserText === "string" ? lastUserText : "",
        info,
      );
      // Write-confirmation gate: before ANY mutating call runs, ask the user to
      // approve it. Stops a wrong-operation fallback from silently changing real
      // data (create-for-update → duplicate). Only mutating tools, only when a
      // `confirmWrite` hook is wired, and never for a malformed / allow-list-blocked call.
      // A navigation (read-only page load) confirms ONLY when it looks like data
      // EXFILTRATION — vault/conversation data or an encoded blob in the URL — so a plain
      // web search / page visit runs WITHOUT a prompt, despite @playwright/mcp marking
      // browser_navigate `destructiveHint:true` (which `isWriteTool` would otherwise honour
      // and pop the misleading "action d'écriture" modal on every search). Every OTHER tool
      // still uses the write heuristic (click/type/fill_form etc. genuinely mutate SaaS state).
      const vaultVals = p.vault ? [...Object.keys(p.vault), ...Object.values(p.vault)] : [];
      // The URL the navigation ACTUALLY dispatches — `wireArg` IS the client's own
      // un-redactor, so this cannot drift from the wire. `navUrl` above stays
      // `fromWireArgs`-based because the domain allow-list only needs the real HOST.
      const wireNavUrl = navUrl
        ? browserNavUrl(call.name, deredactArgs(args, wireArg) as Record<string, unknown>)
        : "";
      // Redaction × navigation: the model only holds fakes, so "va sur le site de X"
      // makes it MINT a hostname from the fake (`norvikgroup.fr`) — a mutation `wireArg`
      // cannot restore, dispatched to an unrelated REAL server. Refuse and steer to a
      // search (whose query IS restorable). Scanned on the WIRE url, post-un-redaction.
      const navFake = wireNavUrl ? fakeDerivedNavHost(wireNavUrl, p.vault) : null;
      // Resolve email attachments UP FRONT — BEFORE the write-confirm (audit M1) — so the
      // user SEES exactly which of their real files will leave (the model only named them),
      // and so the resolved set feeds the exfil analysis. A named file that matches nothing
      // resolves to [] (the store no longer falls back to "all files"), so the model can't
      // exfiltrate every document by naming a non-existent one. Re-used (not re-resolved) for
      // the real dispatch below.
      let resolvedAttachments: { filename: string; mimeType: string; contentBase64: string }[] = [];
      // Requested names that matched NO stored file (or the resolver itself failed):
      // surfaced on the confirm card AND in the model's tool result. Before this, an
      // e-mail left WITHOUT its attachment and nobody was told (audit 2026-08-10) —
      // the fold's `document-N` alias is one-way BY DESIGN (never in the vault), so a
      // model that names it can only miss; the honest outcome is a visible warning,
      // never a silent no-attachment send. Kept in WIRE form: this text goes back to
      // the model (rule 11 — no real value may ride our own note).
      let unresolvedAttachmentNames: string[] = [];
      // Sortie d'un document de la conversation (e-mail `attachments`, dépôt Drive
      // `file`) : le modèle NOMME, le desktop résout les octets — même confirmation.
      const attachField = { send_email: "attachments", upload_file: "file" }[bareTool];
      if (attachField && !draftOnly && !consultOnly && p.resolveAttachments) {
        const raw = (args as Record<string, unknown>)[attachField];
        const rawNames = (Array.isArray(raw) ? raw : [raw]).filter((x): x is string => typeof x === "string" && !!x.trim());
        if (rawNames.length) {
          // A requested name can carry a vault FAKE (a filename holding a detected
          // value): `wireArg` restores it like any outgoing argument, so it can match
          // the stored REAL name. The un-restorable alias case falls through to the
          // unresolved warning below.
          const wireNames = rawNames.map((x) => wireArg(x));
          let resolveFailed = false;
          resolvedAttachments = await raceAbort(p.resolveAttachments(wireNames), p.signal).catch(
            () => {
              resolveFailed = true; // a DB failure is NOT « no attachments » — say so
              return [];
            },
          );
          if (aborted()) return finalizeAborted();
          unresolvedAttachmentNames = resolveFailed
            ? rawNames
            : rawNames.filter((raw, i) => {
                const w = wireNames[i].toLowerCase().trim();
                return !resolvedAttachments.some((a) => matchesAttachmentName(a.filename, [w]));
              });
        }
      }
      // The confirm card lists BOTH: the real files that will leave, and the requested
      // names that will NOT — an unresolved name still forces the card (below), so the
      // user decides on an honest picture instead of discovering the miss in Sent.
      const attachmentNames = [
        ...resolvedAttachments.map((a) => a.filename),
        ...unresolvedAttachmentNames.map((u) => `⚠️ introuvable — ne partira pas : ${u}`),
      ];
      let needsConfirm: boolean;
      // The flags the user is confirming, computed ONCE here and handed to the card — it
      // must not re-derive them (it would use a different vault view and disagree).
      let confirmFlags: NavExfilFlag[] = [];
      let confirmReason: WriteConfirmReason = "write";
      if (isNav) {
        // Scan the WIRE url against the REALS: a real value in a real search box on a real
        // search engine is the POINT (rule 11) and `analyzeNavExfil` exempts it; the same
        // value in `evil.com/?q=` or `google.com/?redirect=` is still exfil.
        // PLACE-name vault values (category `location`) are handed over so an exact
        // path segment (`lemonde.fr/France/`) reads as geography, not smuggling — with
        // `location` now ON by default, every geo navigation confirmed would train the
        // user to blind-click the one card that must stay meaningful.
        const reals = p.vault ? Object.values(p.vault) : [];
        const placeValues = p.kinds ? reals.filter((v) => p.kinds?.[v] === "location") : [];
        const nav = analyzeNavExfil(wireNavUrl, reals, placeValues);
        needsConfirm = !!wireNavUrl && nav.suspicious;
        confirmFlags = nav.flags;
        confirmReason = "nav-exfil";
      } else if (isWrite) {
        needsConfirm = true;
      } else {
        // A READ is DISPATCHED WITHOUT ASKING — only a write may interrupt the user.
        //
        // Confirmer sur des args de LECTURE qui portent une donnée de la conversation tirait
        // sur le cas normal (« recherche Entreprise Zorvia » embarque « Zorvia » : c'est ce
        // qu'une recherche FAIT), et un gate qui demande sur l'ordinaire apprend à cliquer
        // sans lire — ce qu'on dépense ensuite sur la carte d'écriture, la seule qui compte.
        //
        // Le scan TOURNE toujours : on a cessé de bloquer, pas de voir (journal). Confirment
        // encore : toute ÉCRITURE, tout appel portant une pièce jointe (des octets réels qui
        // partent), et une NAVIGATION dont l'URL porte des données réelles — là seulement la
        // destination est choisie par le modèle. Celle d'un connecteur est fixée par le lien.
        if (!missing.length && !skipsArgExfilScan(call.name)) {
          const argExfil = analyzeArgExfil(deredactedArgs, vaultVals);
          if (argExfil.suspicious && !resultEcho.allArgsEchoed(connectorId, args))
            dbg({ type: "phase", scope: "tool", label: `Lecture autorisée d'office · ${call.name}`, detail: argExfil.flags.map((f) => f.param).join(", "), ok: true });
        }
        needsConfirm = false;
      }
      // Any real user file leaving as an attachment MUST be confirmed, whatever the
      // tool's write classification (audit M1) — the confirm card lists the filenames.
      // A write stays a write in the copy; only a would-be-silent call is re-labelled.
      if (attachmentNames.length) {
        if (!needsConfirm) confirmReason = "attachments";
        needsConfirm = true;
      }
      let declinedByUser = false;
      // Redaction dynamique: does THIS call touch redacted data? A governed web call
      // that doesn't gets replay-only results and SKIPS the reveal card below (nothing
      // would be masked in its results, so the card's warning would be false — the
      // "actualité en Espagne" case). Recomputed per call: a later call of the SAME
      // send that embeds a fake still pauses on the card and gets full redaction.
      const navClear = !missing.length && navClearFor(call.name, args);
      // Pre-search REVEAL gate: the FIRST web-search / browser tool of the send PAUSES so
      // the user can pick which redaction categories to reveal for the conversation before
      // the search runs (its RESULT is then redacted per the choice — the query itself
      // always carries the real value, rule 11). Once per send; the store no-ops it when
      // nothing's offerable / the user opted out. Aborts (Stop) release the loop, like the
      // write-confirm. Skipped while a call is clear-mode (`navClear`), AND skipped unless
      // the query actually carries a value in an OFFERABLE category (`navCarriesOfferable`)
      // — a number/secret the card can't reveal (a tokenised year) must not pop it.
      if (!missing.length && !navBlocked && !navFake && !navClear && navCarriesOfferable(args) && p.confirmWebNav && !webNavAsked && isSearchTool(call.name)) {
        webNavAsked = true;
        const webNavPhase = dbg({
          type: "phase",
          scope: "confirm",
          label: `Choix de redaction (recherche web) · ${bareTool}`,
          detail: connectorId,
        });
        try {
          await raceAbort(p.confirmWebNav(), p.signal);
        } catch (e) {
          if (aborted() || isAbortError(e)) {
            updateDebug(webNavPhase, { label: `Choix de redaction interrompu · ${bareTool}`, ok: false });
            return finalizeAborted();
          }
          throw e;
        }
        updateDebug(webNavPhase, { label: `Redaction confirmé · ${bareTool}`, ok: true });
        // The user may have REVEALED categories: un-fake those tokens across the whole
        // context built before the gate, so the rest of THIS turn reasons on the real
        // values ("actualités en france", not the fake country).
        if (p.rewireWire) {
          for (const msg of messages) {
            if (typeof msg.content === "string" && msg.content) msg.content = p.rewireWire(msg.content);
          }
        }
        if (aborted()) return finalizeAborted();
      }
      if (!missing.length && !navBlocked && !navFake && !draftOnly && !consultOnly && !alreadyDone && p.confirmWrite && needsConfirm) {
        // Show the user the values that will ACTUALLY be written (the model's args are
        // FAKES — redacted). Un-redact for DISPLAY only; the real call below still
        // uses the untouched `call.arguments` (the client un-redacts it for the server).
        // ⚠️ A BROWSE tool is shown through `wireArg` — the client's OWN un-redactor — NOT
        // `fromWireArgs`: only `wireArg` restores an ENCODED fake, so a card built from the
        // other one shows `?q=Louis%20Simon` while the page receives the real name — the
        // card would understate what leaves, in the one direction it must never lie. Every
        // other connector goes out through `fromWireArgs` (which also resolves number
        // formulas), so that is the truth there.
        // Race the dialog against Stop, or pressing it while the dialog is open parks the
        // loop forever (the dialog promise only resolves on a click).
        const confirmPhase = dbg({
          type: "phase",
          scope: "confirm",
          label: `Confirmation attendue (${confirmActLabel(confirmReason)}) · ${bareTool}`,
          detail: connectorId,
        });
        let approved: boolean;
        try {
          approved = await raceAbort(
            p.confirmWrite({
              tool: bareTool,
              server: connectorId,
              args: isWebBrowseTool(call.name)
                ? (deredactArgs(args, wireArg) as Record<string, unknown>)
                : deredactedArgs,
              attachments: attachmentNames.length ? attachmentNames : undefined,
              reason: confirmReason,
              flags: confirmFlags,
            }),
            p.signal,
          );
        } catch (e) {
          if (aborted() || isAbortError(e)) {
            updateDebug(confirmPhase, { label: `Confirmation interrompue · ${bareTool}`, ok: false });
            return finalizeAborted();
          }
          throw e;
        }
        updateDebug(confirmPhase, { label: `${approved ? "Autorisé" : "Refusé"} (${confirmActLabel(confirmReason)}) · ${bareTool}`, ok: approved });
        if (aborted()) return finalizeAborted();
        declinedByUser = !approved;
      }
      if (missing.length) {
        content = `Tool error: arguments requis manquants ou vides : ${missing.join(", ")}. Renseigne des valeurs valides puis réessaie.`;
        reason = "arg_error";
        dbg({ type: "tool", vault: p.vault, kinds: p.kinds, name: call.name, ok: false, args: safeJson(call.arguments), error: content });
      } else if (navFake) {
        content =
          `Navigation REFUSÉE : le domaine « ${navFake.host} » semble construit à partir du ` +
          `pseudonyme de redaction « ${navFake.fake} » — ce n'est PAS le site réel (les données ` +
          `sensibles sont pseudonymisées avant que tu les voies). Ne devine JAMAIS une URL à partir ` +
          `d'un nom : fais une recherche web avec ce nom (la requête sera envoyée avec la vraie ` +
          `valeur) puis navigue vers le résultat.`;
        reason = "operational";
        dbg({ type: "tool", vault: p.vault, kinds: p.kinds, name: call.name, ok: false, args: safeJson(call.arguments), error: `domaine dérivé d'un pseudonyme : ${navFake.host}` });
        gateBlocked("nav_pseudonym", bareTool, connectorId);
        p.onToolResult?.({ tool: bareTool, server: connectorId, ok: false, note: `refusé par ${BRAND.name} — adresse dérivée d'un faux` });
        messages.push({ role: "tool", toolCallId: call.id, content });
        if (bumpDead() >= MAX_CONSECUTIVE_DEAD) return finishExhausted();
        continue;
      } else if (navBlocked) {
        content =
          `Navigation REFUSÉE : le domaine « ${navHost} » n'est pas dans la liste des domaines ` +
          `autorisés du navigateur. Navigue uniquement vers : ${p.browserAllowedDomains!.join(", ")}. ` +
          `N'essaie pas de contourner cette restriction.`;
        reason = "operational";
        dbg({ type: "tool", vault: p.vault, kinds: p.kinds, name: call.name, ok: false, args: safeJson(call.arguments), error: `domaine non autorisé : ${navHost}` });
        gateBlocked("nav_domain", bareTool, connectorId);
        p.onToolResult?.({ tool: bareTool, server: connectorId, ok: false, note: `refusé par ${BRAND.name} — domaine non autorisé` });
        messages.push({ role: "tool", toolCallId: call.id, content });
        if (bumpDead() >= MAX_CONSECUTIVE_DEAD) return finishExhausted();
        continue;
      } else if (draftOnly) {
        content =
          "Envoi NON effectué : l'utilisateur a demandé de RÉDIGER ce message, pas de l'ENVOYER. " +
          "Présente le texte rédigé directement dans la conversation (bloc ```document pour un " +
          "e-mail/courrier complet) et attends : l'envoi n'aura lieu que si l'utilisateur le " +
          "demande explicitement (« envoie-le »). N'appelle plus d'outil d'envoi dans ce tour.";
        reason = "operational";
        dbg({ type: "tool", vault: p.vault, kinds: p.kinds, name: call.name, ok: false, args: safeJson(call.arguments), error: "rédaction demandée — envoi non sollicité, refusé" });
        gateBlocked("draft_only", bareTool, connectorId);
        p.onToolResult?.({ tool: bareTool, server: connectorId, ok: false, note: `refusé par ${BRAND.name} — rédaction demandée, pas d'envoi` });
        messages.push({ role: "tool", toolCallId: call.id, content });
        if (bumpDead() >= MAX_CONSECUTIVE_DEAD) return finishExhausted();
        continue;
      } else if (consultOnly) {
        content =
          "Action NON effectuée : l'utilisateur a demandé de CONSULTER, pas de MODIFIER. " +
          "Rien n'a été créé, modifié ni supprimé. Va chercher l'information avec les " +
          "outils de LECTURE du connecteur, puis réponds dans la conversation. Si une " +
          "écriture te semble nécessaire, PROPOSE-la en une phrase et attends une demande " +
          "explicite (« crée-le », « ajoute-le »). N'invente jamais de données à écrire.";
        reason = "operational";
        dbg({ type: "tool", vault: p.vault, kinds: p.kinds, name: call.name, ok: false, args: safeJson(call.arguments), error: "consultation demandée — écriture non sollicitée, refusée" });
        gateBlocked("consult_only", bareTool, connectorId);
        // ⚠️ DIRE QUI REFUSE : sans note, la trace affiche « échec » et le modèle paraphrase
        // en accusant le service (« refusée par l'intégration » — alors qu'aucun appel n'est
        // parti, 15/08). Une note portée par la TRACE, le modèle ne peut pas la réécrire.
        p.onToolResult?.({ tool: bareTool, server: connectorId, ok: false, note: `refusé par ${BRAND.name} — demande lue comme une consultation` });
        messages.push({ role: "tool", toolCallId: call.id, content });
        if (bumpDead() >= MAX_CONSECUTIVE_DEAD) return finishExhausted();
        continue;
      } else if (declinedByUser) {
        content =
          "Action REFUSÉE par l'utilisateur : l'outil n'a PAS été exécuté. Ne relance pas " +
          "cette écriture sans nouvelle instruction ; propose une alternative ou demande à " +
          "l'utilisateur comment procéder.";
        dbg({ type: "tool", vault: p.vault, kinds: p.kinds, name: call.name, ok: false, args: safeJson(call.arguments), error: "refusé par l'utilisateur" });
        gateBlocked("declined", bareTool, connectorId);
        p.onToolResult?.({ tool: bareTool, server: connectorId, ok: false, declined: true });
        messages.push({ role: "tool", toolCallId: call.id, content });
        // A dismissed/declined write that the model keeps retrying (e.g. the confirm
        // popup was closed by navigating away → auto-declined) would otherwise spin
        // until the turn cap. Count it toward the backstop so the loop terminates.
        if (bumpDead() >= MAX_CONSECUTIVE_DEAD) return finishExhausted();
        continue;
      } else if (alreadyDone) {
        // Retry-safety: this exact write already completed in this turn (its key is in the
        // ledger). Do NOT re-run it — feed the model an "already done" result so it moves
        // on instead of repeating a real side effect (the double-send bug). Not a dead-end
        // (it's a success), so `deadStreak` is untouched; the intra-turn dedup + same-tool
        // cap still bound a model that keeps re-emitting it.
        content =
          "Cette action a DÉJÀ été effectuée lors d'une tentative précédente de ce tour — " +
          "elle n'a PAS été relancée (protection anti-doublon). Considère-la comme faite et " +
          "poursuis sans la répéter.";
        dbg({ type: "tool", vault: p.vault, kinds: p.kinds, name: call.name, ok: true, args: safeJson(call.arguments), result: "(déjà effectué — idempotent)" });
        gateBlocked("already_done", bareTool, connectorId);
        p.onToolResult?.({ tool: bareTool, server: connectorId, ok: true, note: "déjà effectué" });
        messages.push({ role: "tool", toolCallId: call.id, content });
        continue;
      } else {
        try {
          // Attachments (Gmail `send_email`): the model NAMED files to attach; they were
          // resolved to ORIGINAL bytes (base64) UP FRONT (before the confirmation above,
          // so their real filenames were shown + approved — audit M1). Inject them here as
          // `__attachmentData` into a COPY (so the debug log / confirm never carry the
          // bytes). The file goes user→recipient via the user's own account; the model
          // never sees the bytes, and un-redaction is a no-op on base64 (no placeholders).
          let callArgs = call.arguments as McpToolCall["arguments"];
          if (resolvedAttachments.length) {
            callArgs = {
              ...(call.arguments as Record<string, unknown>),
              __attachmentData: resolvedAttachments,
            } as McpToolCall["arguments"];
          }
          // The round-trip: un-redact args → real server → re-redact result.
          const mcpCall: McpToolCall = {
            id: call.id,
            name: call.name,
            arguments: callArgs,
          };
          // Live phase + duration for the server round-trip, and — crucially —
          // `raceAbort` so Stop releases the loop immediately (an MCP call has no
          // server cancel channel; the dispatch keeps running in the background but
          // its result is dropped and the bubble finalizes at once).
          callPhase = dbg({ type: "phase", scope: "tool", label: `Outil appelé · ${call.name}`, detail: "en cours…" });
          tCall = Date.now();
          // Seed the live row the INSTANT the call dispatches: a deterministic FR
          // narration ("Ouverture de google.com", "Fouille de la boîte mail") so the
          // user never stares at a bare « en cours… » while the LLM narration (below)
          // is still being generated — or never arrives. The watchdog's ticks re-read
          // the mutable `progressNote`, so the richer narration upgrades the line live.
          progressNote = toolStartNarration(bareTool, connectorId, navHost || undefined);
          if (!aborted()) p.onToolProgress?.(progressNote);
          // Narrate this call in PARALLEL with the round-trip (a web search is 6-12s of
          // dead air). The summarizer sees the WIRE args (redacted fakes — wire-safe) and
          // resolves to "" on failure; it NEVER blocks the tool. The live update is gated
          // on !callSettled so a slow summary can't paint over the next step. On failure
          // ("") the deterministic seed above KEEPS the line — never blank it back.
          progressP = p.summarizeToolCall
            ? p.summarizeToolCall({ tool: bareTool, server: connectorId, args })
                .then((t) => {
                  if (t) progressNote = t;
                  if (t && !callSettled && !aborted()) p.onToolProgress?.(t);
                })
                .catch(() => {})
            : null;
          // Les lectures d'un tour multi-appels ont été pré-lancées plus haut : on attend
          // CE résultat plutôt que d'en refaire un en série (le nom d'outil est threadé par
          // le client, le redaction est passé par le mutex — le parallélisme est sûr).
          // Tout le reste s'appelle ici, dans l'ordre.
          //
          // Les DEUX chemins portent le chien de garde par appel : les ticks doux font
          // vivre la ligne du journal pendant un appel long, et le budget dur par classe
          // change un outil PENDU en erreur `transport` que la machinerie d'impasse absorbe
          // déjà — sans lui, seul le Stop de l'utilisateur libérerait le tour
          // (`TTFT_WATCHDOG_MS` couvre le blocage du MODÈLE, pas celui de l'outil). Un
          // appel pré-lancé est mesuré depuis CETTE attente, exprès généreux ; le Stop
          // gagne quand même tout de suite (`raceAbort` enveloppe les deux).
          //
          // Cadence comportementale (anti-bot) : un humain n'agit pas à l'instant où la
          // page peint. Un léger délai avant une INTERACTION navigateur (clic/saisie/nav,
          // jamais une lecture, qui est pré-lancée) adoucit le signal « inhumainement
          // rapide ». Interruptible, et seulement sur le chemin séquentiel.
          if (isBrowserWriteTool(call.name) && !prefetch.has(call.id)) {
            const paceMs = 350 + Math.floor(Math.random() * 600);
            const sig = p.signal;
            await new Promise<void>((resolve) => {
              if (sig?.aborted) return resolve();
              const t = setTimeout(resolve, paceMs);
              sig?.addEventListener("abort", () => { clearTimeout(t); resolve(); }, { once: true });
            });
            if (aborted()) return finalizeAborted();
          }
          const hardMs = toolTimeoutMs(call.name);
          // Confirmation-policy fact: this conversation dispatched a web search/browse —
          // what the `standard` mode's single card keys on. Counted at DISPATCH (both the
          // prefetched and sequential paths converge here), never on a refused call.
          if (p.convId && isSearchTool(call.name)) recordWebSearch(p.convId);
          // Clear-mode rides the dispatch (per-call `redactText` override). A prefetched
          // call already carries its own decision — made by the SAME predicate.
          const dispatched = prefetch.has(call.id)
            ? prefetch.get(call.id)!
            : client.callTool(mcpCall, navClear ? navClearOpts(call.name, args) : undefined);
          const result = await raceAbort(
            watchToolCall(dispatched, {
              bareTool,
              timeoutMs: hardMs,
              onTick: (elapsed) => {
                // Reads the MUTABLE progressNote so a narration landing between ticks
                // upgrades the line; wire-safe (narration saw WIRE args, rest is a duration).
                if (!callSettled && !aborted())
                  p.onToolProgress?.(liveToolStatus(progressNote, elapsed, hardMs));
              },
            }),
            p.signal,
          );
          callSettled = true; // the round-trip returned → a late summary no longer touches the live line
          callMs = Date.now() - tCall;
          // `detail` DOIT être réécrit avec le label : sans lui la ligne du journal garde
          // le « en cours… » posé au dispatch et se lit « Outil terminé · X — en cours…
          // (686 ms) », c'est-à-dire l'inverse d'un état terminé (journal du 27/07/2026).
          updateDebug(callPhase, {
            label: `Outil ${result.isError ? "en échec" : "terminé"} · ${call.name}`,
            detail: result.isError ? "le connecteur a renvoyé une erreur" : "terminé",
            ok: !result.isError,
            ms: callMs,
          });
          content = resultText(result.content);
          if (result.isError) {
            reason = classifyToolError(content); // server flagged it
            toolErrRaw = content;
          }
          else {
            // The send LEFT without the attachment(s) the model asked for — say so in
            // the result (the model must tell the user), never let « envoyé » imply
            // the file rode along. Names stay in WIRE form (they came from the model).
            if (unresolvedAttachmentNames.length) {
              content +=
                `\n\n[Pièce(s) jointe(s) demandée(s) mais INTROUVABLE(S) — parti(es) SANS : ` +
                `${unresolvedAttachmentNames.join(", ")}. Dis-le explicitement à l'utilisateur.]`;
            }
            resultSummary = summarizeToolResult(content); // trace blurb (redacted)
            // Retry-safety: a side-effecting call that SUCCEEDED is recorded in the
            // ledger, so a "Réessayer" of this turn recognises it and won't repeat it.
            // Only confirmed successes — a failed/declined write is never recorded, so a
            // genuinely-failed action (e.g. the "envoi impossible" case) still retries.
            if (idemKey) p.onWriteDone?.(idemKey);
            if (seenIds.size < 500) for (const id of opaqueIdsIn(content)) seenIds.add(id);
          }
          dbg({
            type: "tool", vault: p.vault, kinds: p.kinds,
            name: call.name,
            ok: !result.isError,
            args: safeJson(call.arguments),
            result: content.slice(0, 600),
            // The provider's OWN explanation, which `content` deliberately drops (it is
            // free upstream text). The journal is its only destination — without it a
            // 400 is unexplainable and everyone downstream is reduced to guessing.
            ...(result.detail ? { error: result.detail } : {}),
          });
        } catch (err) {
          callSettled = true;
          if (tCall) callMs = Date.now() - tCall;
          // Même règle qu'au succès : la ligne du journal ne doit pas rester sur son
          // « en cours… » de dispatch. Elle est close AVANT le retour anticipé du Stop.
          updateDebug(callPhase, {
            label: `Outil ${aborted() || isAbortError(err) ? "interrompu" : "en échec"} · ${call.name}`,
            detail: aborted() || isAbortError(err) ? "interrompu par l'utilisateur" : "l'appel a échoué",
            ok: false,
            ...(callMs ? { ms: callMs } : {}),
          });
          // Stop pressed during the (un-cancellable) dispatch — end the turn now, but
          // SEAL the in-flight call first: its outcome is UNKNOWN (the e-mail may have
          // left), and a transcript where it "didn't happen" makes a retry re-emit it.
          // The rest of the batch stays unanswered and is sealed at resume.
          if (aborted() || isAbortError(err)) {
            messages.push({ role: "tool", toolCallId: call.id, content: INTERRUPTED_TOOL_RESULT });
            return finalizeAborted(); // checkpoints the sealed transcript
          }
          const msg = err instanceof Error ? err.message : String(err);
          toolErrRaw = msg;
          // Audit: a THROWN tool/transport error can ECHO a real (un-redacted) argument value
          // ("Invalid recipient john@real.com" — args reach the server UN-redacted). Re-redact
          // the model-facing error through the SAME vault before it re-enters `messages`; never
          // push it verbatim (the SUCCESS path is already redacted by the client). `msg` stays raw
          // for classify/DebugLog only (renderer-side, never the model).
          // A thrown "Unknown MCP tool: …" means the model invented a tool. Handled FIRST,
          // before any redaction: the raw error is discarded here (we replace it wholesale),
          // and it is a list of tool NAMES generated by our own main process — no user data
          // in it. Redact it cost ~2 s per occurrence for a string nobody reads (journal
          // du 27/07/2026: 7992 car. redacted twice on one failed call).
          if (/unknown (mcp )?tool/i.test(msg)) {
            // NOT `arg_error`: the arguments were never the problem. Saying so sent the
            // user to change model, when no model can call a tool that does not exist.
            reason = "operational";
            struggle.markUnknownTool(call.name);
            // Le routeur a-t-il RATÉ un outil qui existe pourtant ? `toolInfo` ne porte que
            // le pick ; `fullByName` porte tout. Si le nom existe en vrai, ce n'est pas le
            // modèle qui a inventé — c'est le routage qui l'a privé de l'outil.
            if (fullByName.has(call.name)) {
              captureEvent({
                name: "tool_route_miss",
                kind: "missed",
                offered: toolInfo.size,
                available: fullByName.size,
                connector: connectorId,
                provider: p.provider,
                model: p.modelId,
                loopId,
              });
            }
            const siblings = [...toolInfo.keys()]
              .filter((n) => n.startsWith(`${connectorId}__`))
              .map((n) => n.slice(connectorId.length + 2))
              .slice(0, 12);
            content =
              `L'outil « ${call.name} » n'existe pas. ` +
              (siblings.length
                ? `Outils disponibles sur ${connectorId} : ${siblings.join(", ")}.`
                : "Appelle `load_tools` avec le nom du connecteur pour lister ses outils.");
          } else if (err instanceof ToolTimeoutError && idemKey) {
            // A WRITE whose watchdog fired has an UNKNOWN outcome, not a failure (the
            // transport keeps running). « Délai dépassé » reads as "it didn't happen"
            // and the model re-emits the write — a duplicate the ledger can't catch
            // (only confirmed successes are recorded). Wire-safe text, ours.
            reason = "transport";
            content = TIMED_OUT_WRITE_RESULT;
          } else {
            // Args reach the server UN-redacted, so a server error can quote a REAL value
            // ("Invalid recipient john@real.com"): re-redact it through the SAME vault
            // before it re-enters `messages`. `msg` stays raw for classify/DebugLog only.
            const rawErr = `Tool error: ${msg}`;
            content = redactResult
              ? await redactResult(rawErr, p.vault, call.name)
              : "Tool error (détails masqués).";
            reason = classifyToolError(msg);
          }
          // ⚠️ La réécriture `unknown → transport` sert la MÉCANIQUE de relance ; la
          // TÉLÉMÉTRIE, elle, garde la vérité — sinon chaque throw inclassable polluait
          // le bucket réseau (audit 13/08). `trueUnknown` est replié dans `tool_error`.
          if (reason === "unknown") {
            trueUnknown = true;
            reason = "transport";
          }
          dbg({ type: "tool", vault: p.vault, kinds: p.kinds, name: call.name, ok: false, args: safeJson(call.arguments), error: msg });
        }
      }

      // Durée de chaque appel DISPATCHÉ, succès compris (les rejets pré-dispatch n'ont pas de callMs).
      if (callMs !== undefined) captureEvent({ name: "tool_result", connector: connectorId, tool: bareTool, ok: !reason, ms: callMs, provider: p.provider, model: p.modelId, loopId });

      // A browser-backend PROTOCOL fault (Electron can't create a CDP page target,
      // the CDP endpoint is gone) is a deterministic capability failure of the agent
      // browser itself — not the model, not the page. Retrying (or a more capable
      // model) changes nothing, so STOP on the first one with a truthful message
      // instead of burning turns and then blaming the model in the exhaustion text.
      if (reason && isBrowserTool(call.name) && isBrowserBackendFault(toolErrRaw)) {
        captureEvent({ name: "tool_error", server, tool: call.name, reason: "browser_backend", connector: connectorId, provider: p.provider, model: p.modelId, ...(callMs !== undefined ? { ms: callMs } : {}), loopId });
        struggle.emit();
        p.onText(p.fromWire(BROWSER_BACKEND_FAULT_MESSAGE), false);
        emitUsage();
        emitLoopSummary("error", "browser_backend");
        return true;
      }

      // A 4xx does NOT prove the model malformed the call — see `attributeToolFault`.
      if (reason && attributeToolFault(reason, toolInfo.get(call.name)?.inputSchema, args) !== reason) {
        reason = "operational";
        connectorErrored.add(call.name);
      }

      if (reason) {
        // `attempt` lit le compteur AVANT l'incrément du bloc arg_error — même valeur, zéro hoist.
        captureEvent({ name: "tool_error", server, tool: call.name, reason: trueUnknown ? "unknown" : reason, connector: connectorId, provider: p.provider, model: p.modelId, loopId,
          ...(toolErrRaw && reason !== "arg_error" ? { family: classifyErrorFamily(toolErrRaw) } : {}), ...(missing.length ? { param: missing[0] } : {}),
          ...(reason === "arg_error" ? { attempt: (argErrorCount.get(call.name) ?? 0) + 1 } : {}), ...(callMs !== undefined ? { ms: callMs } : {}) });
        if (reason === "arg_error") {
          argErrored.add(call.name);
          // Help a weaker model self-correct: feed back the expected params (and,
          // from the 2nd failure of this tool, a minimal example call). But an
          // INVENTED tool (not in the connected surface — a weak model guessing
          // `tavily__search`) has NO schema, so `argErrorHint` is empty and the model
          // loops on the phantom; name the REAL connectors instead.
          const attempt = (argErrorCount.get(call.name) ?? 0) + 1;
          argErrorCount.set(call.name, attempt);
          const isInvented =
            !fullByName.has(call.name) &&
            call.name !== "load_tools" &&
            call.name !== "run_python" &&
            call.name !== "suggest_integrations";
          content += isInvented
            ? unknownToolHint(fullByName)
            : argErrorHint(call.name, toolInfo.get(call.name)?.inputSchema, attempt);
        }
        // Un identifiant recopié de travers : on rend la bonne valeur (`identifierTypo.ts`).
        else content += identifierTypoHint(args, seenIds);
      } else {
        succeeded.add(call.name);
      }

      // Live-derived operation fallback (operationResolver): the intent search said
      // "no matching operations" for a WRITE — probe the SAME search tool to derive
      // the real operationId by REST convention. Bounded + deduped; a miss is a
      // silent no-op (self-correction still applies). The probes go through the SAME
      // redacting client as every outgoing call (rule 11, both legs — audit
      // 2026-08-10: `resource` derives from WIRE args, so a fake must be un-redacted
      // outward, and the server's output re-redacted before `op.*` re-enters the
      // model message; "API schema, no PII" was an assumption, not a guarantee).
      // Each probe is a REAL network call: counted, journaled and watchdogged.
      if (!reason && /no matching operation/i.test(content)) {
        const wantAction = typeof args.intent === "string" ? args.intent : undefined;
        const wantResource = typeof args.resource === "string" ? args.resource : undefined;
        const na = wantAction ? normalizeAction(wantAction) : null;
        const isWrite = na === "update" || na === "create" || na === "delete";
        const writeTool = [...toolInfo.values()].find(
          (t) => t.name.startsWith(`${connectorId}__`) && /write$/i.test(t.name),
        );
        const fbKey = `${connectorId}|${wantResource}|${na}`;
        if (wantResource && isWrite && writeTool && !opResolved.has(fbKey)) {
          opResolved.add(fbKey);
          const op = await raceAbort(
            resolveOperation(
              async (q) => {
                callCounts.set(call.name, (callCounts.get(call.name) ?? 0) + 1);
                const r = await watchToolCall(
                  client.callTool({ name: call.name, arguments: q as McpToolCall["arguments"] }),
                  { bareTool, timeoutMs: toolTimeoutMs(call.name) },
                );
                const text = resultText(r.content);
                dbg({
                  type: "tool", vault: p.vault, kinds: p.kinds,
                  name: call.name,
                  ok: !r.isError,
                  args: safeJson(q),
                  result: text.slice(0, 300),
                });
                return text;
              },
              { resource: wantResource, action: wantAction! },
            ),
            p.signal,
          ).catch(() => null); // an abort (or a probe failure) → treat as no op; the check below finalizes
          if (aborted()) return finalizeAborted();
          if (op) {
            content +=
              `\n\n(Op\u00e9ration trouv\u00e9e : operationId \`${op.operationId}\` (${op.method} ${op.path}). ` +
              `Appelle \`${writeTool.name}\` avec cet operationId et les param\u00e8tres requis \u2014 n'utilise PAS l'op\u00e9ration de cr\u00e9ation.)`;
          }
        }
      }
      // Give the parallel narration a brief chance to land so it can be PERSISTED on
      // the trace — bounded, and only ever a WAIT the tool didn't already outlast (the
      // summarizer has its own timeout and never rejects). For a slow tool it's already
      // resolved (instant); for a fast one we don't stall the loop waiting on it.
      if (progressP)
        await raceAbort(
          Promise.race([progressP, new Promise<void>((r) => setTimeout(r, 400))]),
          p.signal,
        ).catch(() => {});
      // Record the finished call for the assistant message's persisted workflow
      // trace (connector + succession + a short redacted result blurb + narration).
      p.onToolResult?.({
        tool: bareTool,
        server: connectorId,
        ok: !reason,
        summary: reason ? undefined : resultSummary,
        note: progressNote,
        ms: callMs,
      });

      // Stuck-loop guard, CUMULATIF et clé sur (outil + contenu exact) : un outil qui
      // rend toujours le MÊME résultat est une impasse. Ce n'est pas un `arg_error`,
      // donc rien plus haut ne pousse le modèle, et un modèle faible ignore un indice
      // poli (GLM-5.2 bouclait update/modify/edit/patch). Un comptage CONSÉCUTIF le
      // raterait aussi : un succès au milieu remet la série à zéro. D'où un décompte
      // sur TOUT le tour, avec escalade — indice dès la 2e, ARRÊT DUR à la 3e.
      //
      // Seules les occurrences NON PRODUCTIVES comptent : produire, c'est de NOUVEAUX
      // arguments ET un vrai résultat (ni erreur, ni impasse). Chercher plusieurs
      // clients dont chacun est légitimement introuvable est une EXPLORATION à résultat
      // vide valide — jamais une boucle.
      const tallyKey = `${call.name} ${content}`;
      const seen = (resultTally.get(tallyKey) ?? 0) + 1;
      resultTally.set(tallyKey, seen);
      const argSig = safeJson(args);
      let argsSeen = resultArgs.get(tallyKey);
      if (!argsSeen) resultArgs.set(tallyKey, (argsSeen = new Set()));
      const newInput = !argsSeen.has(argSig);
      argsSeen.add(argSig);
      const productive = newInput && !reason && !DEAD_END_RE.test(content);
      const stuckSeen = productive ? 0 : (unproductiveTally.get(tallyKey) ?? 0) + 1;
      unproductiveTally.set(tallyKey, stuckSeen);
      // Cross-tool backstop: reset on progress, else count (once per RESPONSE — bumpDead).
      if (productive) deadStreak = 0;
      else bumpDead();
      // Forward progress → extend the turn budget (bounded). A productive call (new
      // input + real result) is a real step in the pipeline and earns more turns; a
      // repeat or an error/dead-end grants nothing.
      if (productive) {
        turnBudget = Math.min(MAX_TURNS_HARD, turnBudget + TURNS_PER_PROGRESS);
      }
      // repeatedResult[tool] = max unproductive-repeats, consumed by exhaustionMessage.
      if (stuckSeen - 1 > (repeatedResult.get(call.name) ?? 0)) repeatedResult.set(call.name, stuckSeen - 1);
      // Une répétition qui vient d'un ÉCHEC n'accuse pas le modèle (`repeatedFailureOf`).
      if (reason && stuckSeen >= 2) repeatedFailure = repeatedFailureOf(call.name, content, argsSeen.size);
      if (stuckSeen >= STUCK_STOP) {
        // Keep the model's context coherent (record this tool turn), then stop the
        // loop and hand the user an explicit, actionable diagnosis — don't burn the
        // remaining turns on a call that has already proven unproductive.
        messages.push({ role: "tool", toolCallId: call.id, content });
        struggle.emit();
        p.onText(
          p.fromWire(
            exhaustionMessage({ callCounts, repeatedResult, argErrored, succeeded, maxTurns: turnBudget, stopped: "stuck", repeatedFailure }),
          ),
          false,
        );
        emitUsage();
        emitLoopSummary("exhausted");
        return true;
      }
      if (deadStreak >= MAX_CONSECUTIVE_DEAD) {
        // Too many non-productive RESPONSES in a row — stop early. Record this turn first.
        messages.push({ role: "tool", toolCallId: call.id, content });
        return finishExhausted();
      }
      // Une ÉCRITURE qui échoue ne se rejoue pas — le pourquoi est sur `withFailedWriteNote`.
      content = withFailedWriteNote(content, call.name, !!reason && stuckSeen === 1 && isWriteTool(call.name, info?.description, info?.annotations));
      if (stuckSeen >= 2) {
        // Name the OTHER tools of this connector that are callable RIGHT NOW, so the
        // model has concrete alternatives instead of re-guessing the same dead-end tool.
        const siblings = [...toolInfo.values()]
          .filter((t) => t.serverId === server && t.name !== call.name)
          .map((t) => t.name)
          .slice(0, 8);
        content +=
          `\n\n(Note : \`${call.name}\` a déjà renvoyé ce même résultat ${stuckSeen} fois. Ne relance PAS le même appel — ` +
          `essaie un AUTRE outil` +
          (siblings.length ? ` (appelables ici : ${siblings.map((n) => `\`${n}\``).join(", ")})` : "") +
          `, ou explique à l'utilisateur ce qui bloque. NE substitue PAS une opération différente de l'action voulue (créer ≠ mettre à jour → doublon).)`;
      }
      // Told with the evidence, in the result itself — READS only (`batchReads`).
      if (!reason && shouldNudgeBatch(soloRead) && isConfidentReadOnly(call.name, toolInfo.get(call.name))) {
        soloRead!.told = true;
        content += batchReadNudge(call.name, soloRead!.count);
      }
      resultEcho.record(connectorId, content);
      messages.push({ role: "tool", toolCallId: call.id, content });

      // Surface any downloadable file URL this call returned (already stripped
      // from the model-facing text) — fetch + display the real file to the user.
      // Best-effort: a failed fetch must never break the agentic turn.
      for (const f of exportedUrls.splice(0)) {
        if (aborted()) break;
        try {
          await p.onExportedFile?.(f.url, f.mime);
        } catch {
          /* ignore — the model already saw the placeholder */
        }
      }
    }
    // End of an agentic turn: every tool_use of this model response now has its result
    // pushed, so `messages` is a VALID (pairing-complete) boundary. Checkpoint it so a
    // retry can resume from here — the finest granularity that stays replayable (a
    // mid-turn checkpoint could leave an assistant tool_use with no matching result).
    checkpointTranscript();
  }

  // Hit the turn cap without a final answer — surface an EXPLICIT diagnosis so the
  // user isn't left with a bare "limit reached": what the model was stuck on
  // (repeated identical results, unrecovered arg/JSON errors, or just too many
  // steps) and what to try next. Names only — never argument values (wire-safe).
  struggle.emit();
  p.onText(p.fromWire(exhaustionMessage({ callCounts, repeatedResult, argErrored, succeeded, maxTurns: turnBudget })), false);
  emitUsage();
  emitLoopSummary("exhausted");
  return true;
}
