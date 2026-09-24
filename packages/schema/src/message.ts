/**
 * The canonical persisted MESSAGE shape. PERSISTED data: only ADD optional fields; never
 * rename or repurpose one without a storage migration on every surface.
 */
import type { RedactCategoryKey, AskTarget } from "./index";

/** Chat roles — a message's author. */
export type Role = "system" | "user" | "assistant";

export interface Message {
  id: string;
  role: Role;
  content: string;
  /** Epoch ms at send time; powers the per-day usage timeline. Optional: older messages
   *  fall back to the conversation's `updatedAt`. Not sensitive. */
  at?: number;
  /** True while the assistant message is still streaming. */
  pending?: boolean;
  error?: boolean;
  /** The response was cut short or came back empty — the bubble shows an "incomplete"
   *  indicator + Réessayer. */
  incomplete?: boolean;
  /** A failed assistant turn's error text, PERSISTED so it survives a reload; rendered
   *  under the bubble with a "Réessayer" that regenerates in place. */
  errorText?: string;
  /**
   * Actionable CTA for a failed turn, persisted beside `errorText`.
   * `missing_key` → no API key for `provider` (a plain string so the schema stays UI-free).
   * `upgrade_plan` → an INDIVIDUAL user's platform credit budget is exhausted (never an org
   * member: their budget is admin-managed).
   * `credit_options` → a platform send blocked on credits on a free-tier account: take a
   * subscription, or use your own key for `provider`.
   */
  errorAction?:
    | { kind: "missing_key"; provider: string; label?: string }
    | { kind: "upgrade_plan" }
    | { kind: "credit_options"; provider: string; label?: string };
  /** The tool the agentic loop is calling right now — drives the "Appel de l'outil…" indicator. */
  toolCall?: string;
  /** The provider's REMAINING request quota as of this turn — numbers only. Transient like
   *  `toolStatus` (no DB column on purpose): a live counter on an old message would lie. */
  quotaLeft?: { remaining: number; limit?: number; resetAt?: number };
  /** A LIVE status for the in-flight tool (latest stdout line…). Transient, never persisted. */
  toolStatus?: string;
  /**
   * The agentic tool calls made while producing this turn, in call order, PERSISTED so the
   * workflow trace survives a reload. `server` = connector id (tool-name prefix before `__`),
   * `tool` = bare tool name, `summary` = short already-redacted result descriptor, `note` =
   * one-line human narration (already un-redacted), `declined` = the USER refused this
   * write (the gate worked: no failure row, no retry banner).
   */
  toolCalls?: { tool: string; server: string; ok: boolean; declined?: boolean; summary?: string; note?: string; ms?: number }[];
  /**
   * The model's REFLECTION for this turn (a reasoning model's separate channel), already
   * un-redacted through the conversation's vault like `content`. Shown collapsed behind
   * « Réflexion ».
   * ⚠️ At-rest class: `modelContent`'s, not `content`'s — REAL data and unbounded. The
   * encrypted Host DB owns it and `stripVaultForLocal` drops it from the plaintext mirror;
   * nothing needs it before the async DB load since it starts collapsed.
   */
  reasoning?: string;
  /** How many sensitive items were redacted from this message (0 = none). */
  redactions?: number;
  /** The sensitive spans of the ORIGINAL text and their kind, for local colour highlighting.
   *  The model only ever saw the scrubbed version. */
  redactedSpans?: { value: string; kind: string }[];
  /** Files attached to this user message — shown as chips. The redacted file lives in the
   *  `files` table; its text is folded into the model payload only, never into `content`. */
  attachments?: { name: string; kind: string; mime?: string }[];
  /** The text actually sent to the model for this user turn: `content` plus the attached
   *  files' text. Lets later turns re-include the document; absent when nothing was attached. */
  modelContent?: string;
  /**
   * The WORKING SCRIPT of a turn whose `run_python` succeeded, in WIRE form (vault fakes
   * only, so safe in the plaintext snapshot). Replayed into the wire history (latest
   * occurrence only, `send/buildWire.ts`) so a follow-up ITERATES on it, and seeded
   * de-redacted into the sandbox CWD as `analyse.py`. Bounded by the writer.
   */
  pythonScript?: string;
  /**
   * Stable id of the agentic TURN (set on the user message, carried to its reply) so a
   * retry re-uses the SAME id: the agent loop keys write-idempotency on it
   * (`Conversation.writeLedger`), which stops a retry from repeating a side-effecting call.
   * Opaque, not PII.
   */
  turnId?: string;
  /** Set on a USER message sent via « Générer un graphique »: the directive rides
   *  `modelContent`, the bubble shows a tag chip instead. */
  plotTag?: "graphique";
  /**
   * Set on a USER message sent with a SKILL: like `plotTag`, the prompt rides
   * `modelContent` and the bubble shows a clickable tag. `prompt` is a SNAPSHOT of what
   * went out (the skill may be edited or deleted later).
   * ⚠️ `prompt` is REAL user text and may carry PII: stripped from the plaintext copy
   * alongside `modelContent` (`ui/src/send/sendGuards.ts`). `id`/`name` stay: they are the
   * tag and must render before the DB load.
   */
  competence?: { id: string; name: string; prompt?: string; servers?: string[] };
  /** LEGACY tag, never WRITTEN again, always READ (`competence ?? workflow`): it is
   *  persisted in everyone's history. */
  workflow?: { id: string; name: string; prompt?: string; servers?: string[] };
  /** « Demander » target tag — like `competence`, model-only context line; shape + at-rest rule: `./askTarget.ts`. */
  askTarget?: AskTarget;
  /** EXPLICIT memory-ask feedback: how many durable facts the extraction noted. 0 is an
   *  ANSWER (« rien de durable à retenir »), not an absence. Silent extraction stays silent. */
  memoryNoted?: number;
  /** Ids of the memory cards CREATED by that explicit-ask extraction — deep-link + « Annuler ».
   *  Opaque ids resolved at render; absent when every fact merged into existing cards. */
  memoryNotedIds?: string[];
  /** Ids of the EXISTING cards that extraction UPDATED — the « fiche mise à jour » segment.
   *  Same opacity rule as `memoryNotedIds`. */
  memoryUpdatedIds?: string[];
  /** The explicit extraction is RUNNING. Transient: replaced by the result, purged on load
   *  (`clearStuckPending`). */
  memoryNotedPending?: boolean;
  /** The explicit-ask extraction FAILED for real (distinct from `memoryNoted: 0`): drives an
   *  honest « réessayez » caption. Cleared by a later successful ask on the same turn. */
  memoryNotedFailed?: boolean;
  /** MEMORY injected into THIS send: the card ids (plus the `"profile"` sentinel) whose facts
   *  rode the system content. Drives « Mémoire utilisée ». Ids only, resolved at render. */
  memoryUsed?: string[];
  /** MEMORY near-miss on this send: cards that could have gone out but did NOT for a
   *  SURPRISING reason (budget saturated, a too-common first name ignored alone). Normal
   *  non-recall stays silent. Opaque ids + reason code. */
  memorySkipped?: { id: string; reason: "budget" | "homographe" }[];
  /** The AI redaction model was meant to run on this message but failed, so free-form PII
   *  may be unmasked. Human-readable warning shown under the message. */
  redactionFailed?: string;
  /** A turn's tool calls went wrong, and WHOSE fault it was — each kind needs a different
   *  move from the user. */
  toolStruggle?: {
    tool: string;
    server: string;
    model: string;
    /** `arg_error` / `no_tool_used` deserve « changez de modèle »; `unknown_tool` (a
     *  NONEXISTENT tool) and `connector_error` (the connector refused a schema-valid call)
     *  do not — a better model would hit the same refusal. */
    kind: "arg_error" | "no_tool_used" | "unknown_tool" | "connector_error";
  };
  /**
   * Token usage for an assistant turn. `billed` records the ROUTING decision at send time
   * (`resolveEffectivePlatform`): `"subscription"` = metered credits, `"byo"` = the user's
   * own key. Absent on older turns — the usage view buckets those as « Inconnu ».
   */
  usage?: {
    model: string;
    inputTokens: number;
    outputTokens: number;
    billed?: "byo" | "subscription";
    /** The counts are OURS (chars/4 over the wire), not the provider's: the turn ended
     *  without the terminal frame carrying the real numbers (Stop, mid-stream error, a
     *  provider that never reports usage). An estimate is more honest than nothing — the
     *  provider bills what it generated either way. Absent = measured. */
    estimated?: boolean;
  };
  /** The model id that ACTUALLY answered, pinned at send time (the conversation's model may
   *  change later). Absent on user turns and older assistant turns. */
  model?: string;
  /** AUTO mode: how the router-picked turn is billed, stamped at send time. Persisted: a
   *  MONEY claim must survive a reload. Absent = the user picked the model themselves. */
  autoRouted?: "free" | "byo" | "metered";
  /** Connector ids the assistant proposed because it lacked an integration. Rendered as
   *  clickable cards deep-linking to Réglages → MCP. Ids are `@openmasq/catalog/mcp` ids;
   *  the UI resolves display data from the catalog. Persisted. */
  suggestedIntegrations?: string[];
  /**
   * When this turn used an INTERNET-NAVIGATION tool while the conversation still redacts
   * some of name/dob/address/location/company, the OFFERABLE subset is pinned here so the
   * bubble shows a one-time opt-in form proposing to stop redacting them (public web
   * content's names are usually its substance). Set on the FIRST such turn only. An EMPTY
   * array = resolved, never re-offered. Org-forced categories are excluded.
   */
  webNavRedactOffer?: RedactCategoryKey[];
}
