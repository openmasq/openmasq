import type { ChatMessage, ProviderId, TokenUsage } from "@openmasq/llm";
import type { Vault } from "@openmasq/mcp";
import type { Host, WebFetchItem } from "../../host";
import type { NavExfilFlag } from "../../state/browserPolicy";
import type { RoutingConfig, CatalogConfig } from "../routingConfig";
import type { ToolStruggle } from "../toolStruggle";

/** WHY the confirm card opened — the loop knows, the card must not guess.
 *  `write`: a genuinely mutating call. `nav-exfil`: a navigation whose URL carries real
 *  conversation data or an encoded blob. `attachments`: real user files leave with the call.
 *  There is deliberately no read-args reason: a read dispatches without asking. */
export type WriteConfirmReason = "write" | "nav-exfil" | "attachments";

/** What the loop hands the confirm card. `args` are DISPLAY values, un-redacted with the
 *  SAME policy the wire uses, so what the user reads is what the tool receives. `flags` are
 *  computed by the loop, never re-derived by the card (it sees another vault view). */
export interface WriteConfirmInfo {
  tool: string;
  server: string;
  args: Record<string, unknown>;
  /** The REAL filenames that will leave (the model only ever named them). */
  attachments?: string[];
  reason: WriteConfirmReason;
  /** The exfil signals that OPENED the card (empty for a plain write). */
  flags: NavExfilFlag[];
}

export interface PythonRunResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  images: { name: string; base64: string }[];
  files: { name: string; base64: string; mime: string }[];
}

export type ResolvedAttachment = { filename: string; mimeType: string; contentBase64: string };

export interface McpAgentParams {
  host: Host;
  provider: ProviderId;
  modelId: string;
  apiKey?: string;
  baseUrl?: string;
  /** The redacted (wire-form) conversation so far — the model only sees placeholders. */
  history: ChatMessage[];
  /** Shared conversation vault, mutated in place as tool results reveal new secrets. */
  vault: Vault;
  /** value → kind (original → category), for the Debug Log colouring and the reveal gate. */
  kinds?: Record<string, string>;
  secrets: string[];
  disabledKinds: string[];
  connectorMasking?: Record<string, import("@openmasq/catalog").ConnectorMasking>;
  /** Domains of CONNECTED integrations: a link to one of them stays in clear. */
  structuralUrlHosts?: string[];
  /** Connector allow-list (catalog ids); `undefined` = no organization. */
  allowedServerIds?: string[];
  /** Agent-browser hardening: strip the browser's acting tools / bound where it may navigate. */
  browserReadOnly?: boolean;
  browserAllowedDomains?: string[];
  /** Connectors the user SCOPED this send to — routing keeps their tools callable (a widening). */
  scopedConnectors?: string[];
  /** The app has a built-in browser that can be enabled: never suggest a paid search connector. */
  browserEnableable?: boolean;
  /** How a tool RESULT is redacted before the model sees it (model engine when available,
   *  else the client's default regex). 3rd arg = the namespaced tool, for per-connector policy.
   *  `many` redacts N same-tool results in ONE engine pass (`redactCoalesce.ts`). */
  redactResult?: ((text: string, vault: Vault, tool?: string) => string | Promise<string>) & {
    many?: (texts: string[], vault: Vault, tool?: string) => Promise<string[]>;
  };
  /** Restore placeholders for display. */
  fromWire: (s: string) => string;
  /** URL-aware restore for the confirm card (a fake in a query is `%20`/`+`-encoded). */
  fromWireArgs?: (s: string) => string;
  onText: (content: string, pending: boolean) => void;
  /** The tool currently being called, or `null` once done. */
  onToolCall: (name: string | null) => void;
  /** A tool call FINISHED — appended to the message's persisted trace. */
  onToolResult?: (r: { tool: string; server: string; ok: boolean; declined?: boolean; summary?: string; note?: string; ms?: number }) => void;
  /** One short human line for a call, from WIRE args, in parallel with the round-trip; "" on failure. */
  summarizeToolCall?: (info: { tool: string; server: string; args: Record<string, unknown> }) => Promise<string>;
  /** Live narration for the in-flight tool (dropped once it finished). */
  onToolProgress?: (text: string) => void;
  /** First sign of generation per model call (prose OR a tool-call argument). */
  onFirstToken?: () => void;
  /** Running char-count (+ name) of the tool-call arguments the model is streaming. */
  onToolArgs?: (chars: number, name?: string) => void;
  /** Live reasoning delta, WIRE-form like `onText`. */
  onReasoning?: (delta: string) => void;
  /** Turn-total usage; `toolCount` = connected tools offered this turn. */
  onUsage?: (usage: TokenUsage & { toolCount: number; modelTurns: number }) => void;
  onQuotaLeft?: (left: { remaining: number; limit?: number; resetAt?: number }) => void;
  /** A tool the model kept malforming without recovering. At most once per turn. */
  onToolStruggle?: (info: ToolStruggle) => void;
  /** Catalog connector ids to render as "connect this integration" cards. Once per turn. */
  onSuggestIntegrations?: (ids: string[]) => void;
  /** Renderer-side Stop; checked between model calls / tool calls and raced into blocking awaits. */
  signal?: AbortSignal;
  /** Correlates the model calls so Stop can abort the in-flight provider fetch in main. */
  requestId?: string;
  /** Stamps every Debug-Log entry (concurrent per-tab turns stay separate). */
  convId?: string;
  /** Stable id of the TURN; a retry reuses it. Side-effecting calls are keyed on (turnId, tool, WIRE args). */
  turnId?: string;
  /** Has this exact side-effecting call already completed in this turn? True ⇒ skipped, told "done". */
  writeLedgerHas?: (key: string) => boolean;
  /** Record a side-effecting call as COMPLETED — only after it returned WITHOUT error. */
  onWriteDone?: (key: string) => void;
  /** Wire transcript of a PRIOR failed attempt of this turn, seeded after `history` so the model CONTINUES. */
  resumeTranscript?: ChatMessage[];
  /** Checkpoint the accumulated tool-turn transcript (wire form) at each tool_use↔tool_result boundary. */
  onResumeTranscript?: (transcript: ChatMessage[]) => void;
  /** A downloadable file URL found in a tool result — the host fetches, stores and displays it. */
  onExportedFile?: (url: string, mimeType: string) => Promise<void> | void;
  /** Ask the USER before a call runs. Resolves true = run, false = skip (fed back to the model). */
  confirmWrite?: (info: WriteConfirmInfo) => Promise<boolean>;
  /** BLOCKING pre-search gate, ONCE per send, before the first web-search / browser tool.
   *  ⚠️ Governs what the MODEL sees (`disabledKinds`), NEVER what the browser sends: the
   *  outward leg is unconditional (rule 11). Never wire it into an arg-un-redaction list. */
  confirmWebNav?: () => Promise<void>;
  /** Un-fake the tokens whose category the reveal gate just disabled, in an already-wired string.
   *  Applied to the whole in-flight context after `confirmWebNav` (`evals/navigation.test.ts`). */
  rewireWire?: (s: string) => string;
  /** Resolve file names the model asked to ATTACH to the conversation's real bytes. Runs BEFORE
   *  the confirm so the card lists the real filenames; a name matching nothing resolves to NOTHING. */
  resolveAttachments?: (names: string[]) => Promise<ResolvedAttachment[]>;
  /** LOCAL memory lookup for `memory_search` (query un-redacted before, result re-redacted after). */
  searchMemory?: (query: string) => string | Promise<string>;
  /** Sandboxed Python. Present ⇒ `run_python` is offered, even with zero connectors. */
  runPython?: (code: string) => Promise<PythonRunResult>;
  onPythonImage?: (img: { name: string; base64: string }) => Promise<void> | void;
  onPythonFile?: (file: { name: string; base64: string; mime: string }) => Promise<void> | void;
  /** A `run_python` SUCCEEDED: the script as the MODEL wrote it (WIRE form), kept for iteration. */
  onPythonScript?: (wireCode: string) => Promise<void> | void;
  /** Batch web reader. Present ⇒ `web_fetch_many` is offered. */
  fetchMany?: (urls: string[]) => Promise<WebFetchItem[]>;
  /** Routing/catalog thresholds — only the eval bench passes this. */
  routingConfig?: { routing: RoutingConfig; catalog: CatalogConfig };
}
