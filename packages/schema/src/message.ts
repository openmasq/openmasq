/**
 * The canonical persisted MESSAGE shape — split out of `index.ts` (rule 1), beside
 * `conversation.ts` and `askTarget.ts` (same reason). PERSISTED data: only ADD optional
 * fields; never rename/repurpose one without a storage migration on BOTH surfaces (desktop + extension).
 */
import type { RedactCategoryKey, AskTarget } from "./index";

/** Chat roles — a message's author. The canonical union for every surface. */
export type Role = "system" | "user" | "assistant";

export interface Message {
  id: string;
  role: Role;
  content: string;
  /**
   * Epoch ms when this message was created (stamped at send time). Powers the
   * per-day usage timeline. OPTIONAL and additive: pre-tracking messages have none —
   * the usage view falls back to the conversation's `updatedAt`. Not sensitive.
   */
  at?: number;
  /** True while the assistant message is still streaming. */
  pending?: boolean;
  error?: boolean;
  /** The response was cut short (stream interrupted by a reload/quit) or came
   *  back empty — the bubble shows an "incomplete" indicator + Réessayer. */
  incomplete?: boolean;
  /**
   * A failed assistant turn's error text, PERSISTED on the message so it survives
   * a reload (instead of a transient banner + an empty bubble). Rendered under the
   * bubble with a "Réessayer" button that regenerates the reply in place — no
   * duplicate user message.
   */
  errorText?: string;
  /**
   * An optional actionable CTA for a failed turn, PERSISTED alongside `errorText`.
   * `missing_key` → no API key for the chosen provider: "Renseigner la clé" opens the
   * key modal for `provider` (a plain string so the schema stays UI-free; the UI
   * narrows it back to `ProviderId`); once saved the turn regenerates in place.
   * `upgrade_plan` → an INDIVIDUAL user's platform credit budget is exhausted:
   * "Passer à une offre supérieure" opens Réglages → Paiement (never set for an org
   * member — their budget is admin-managed).
   * `credit_options` → a platform send blocked on credits on a NON-paying (free tier)
   * account: two cards — take a subscription, or use your own key for `provider`. A
   * PAYING account gets no action (a plain "indisponible pour le moment" text).
   */
  errorAction?:
    | { kind: "missing_key"; provider: string; label?: string }
    | { kind: "upgrade_plan" }
    | { kind: "credit_options"; provider: string; label?: string };
  /** While the agentic MCP loop is calling a tool, the tool's name — drives the
   *  animated "Appel de l'outil…" indicator in the assistant bubble. */
  toolCall?: string;
  /** The provider's REMAINING request quota as of this turn — numbers only, no content.
   *  ⚠️ Transient like `toolStatus` (no DB column ON PURPOSE): a live counter shown on an
   *  old message would state a figure that has since moved. It exists to warn while there
   *  is still room to act; the daily cap used to be discovered at zero, mid-turn. */
  quotaLeft?: { remaining: number; limit?: number; resetAt?: number };
  /** A LIVE status for the in-flight tool (the Python runner's "Exécution du code…", the
   *  code's latest stdout line) so "en cours…" EVOLVES instead of sitting static.
   *  Transient (never persisted), cleared when the tool finishes. */
  toolStatus?: string;
  /**
   * The agentic MCP tool calls made while producing this assistant turn, in call
   * ORDER, PERSISTED so the "workflow trace" (connector + succession of tools +
   * result summaries) survives a reload instead of vanishing when the turn ends.
   * `server` is the connector id (the tool-name prefix before `__`, e.g.
   * "linear"); `tool` is the bare tool name; `summary` is a short, already-redacted
   * result descriptor (e.g. "3 dépôts"); `ok` = the call succeeded; `note` is an
   * optional one-line, human-readable NARRATION of what the call did (LLM-generated
   * in parallel with the call, already un-redacted — e.g. "Recherche d'actualités
   * françaises"), grouped by connector in `ToolTrace`. `declined` = the USER refused
   * this write (the gate WORKED): no "échec" row, no retry banner. Optional.
   */
  toolCalls?: { tool: string; server: string; ok: boolean; declined?: boolean; summary?: string; note?: string; ms?: number }[];
  /**
   * The model's REFLECTION for this assistant turn — the chain of thought a reasoning
   * model streams on a channel separate from its answer (`@openmasq/llm`
   * `onReasoning`), accumulated and **already un-redacted** through the conversation's
   * vault, exactly like `content`.
   *
   * Persisted because it is the honest record of HOW the turn was reached: it used to
   * be dropped the moment the answer landed, so the one thing that explained a long
   * wait vanished at the instant the user could have read it. The UI shows it collapsed
   * behind « Réflexion » above the answer.
   *
   * ⚠️ **At-rest class: `modelContent`'s, not `content`'s.** It holds the user's REAL
   * data (the model reasons about fakes; this is the un-redacted form) and is unbounded
   * — a thinking model emits thousands of tokens per turn. So the encrypted Host DB owns
   * it and `stripVaultForLocal` drops it from the plaintext localStorage mirror; unlike
   * `content` nothing needs it before the async DB load, since it starts collapsed.
   */
  reasoning?: string;
  /** How many sensitive items were redacted from this message (0 = none). */
  redactions?: number;
  /** The sensitive spans in this message's (original) text and their kind, so the UI can
   *  highlight the real values by colour. The model still only saw the scrubbed version;
   *  these are for local display. */
  redactedSpans?: { value: string; kind: string }[];
  /** Files attached to this (user) message — shown as file chips, NOT as text. The
   *  redacted file is stored in the `files` table; its (redacted) text is folded into the
   *  model payload only, never into the displayed `content`. */
  attachments?: { name: string; kind: string; mime?: string }[];
  /**
   * The ORIGINAL text actually sent to the model for this user turn — the clean
   * `content` PLUS the attached files' text folded in. Stored so later turns
   * re-include the document (rebuilt deterministically via the vault); the
   * displayed bubble still uses the clean `content`. Absent when no file was
   * attached (history falls back to `content`).
   */
  modelContent?: string;
  /**
   * The WORKING SCRIPT of an assistant turn whose `run_python` succeeded: the code as
   * the MODEL wrote it (WIRE form — vault fakes only, so it is safe in the plaintext
   * localStorage snapshot, unlike `modelContent`). Invisible iteration machinery, no
   * UI: replayed into the wire history (latest occurrence only, `send/buildWire.ts`)
   * so a follow-up turn ITERATES on the script instead of regenerating the analysis,
   * and seeded (de-redacted via the vault) into the sandbox CWD as `analyse.py`.
   * Bounded by the writer (`ui/src/state/store.ts`).
   */
  pythonScript?: string;
  /**
   * Stable id of the agentic TURN this message belongs to. Set on the user message
   * (and carried to its assistant reply) so a "Réessayer" can re-use the SAME id — the
   * agent loop keys write-idempotency on it (see `Conversation.writeLedger`), which is
   * what stops a retry from repeating a side-effecting call that already succeeded.
   * Not PII (an opaque id); kept in the plaintext localStorage snapshot.
   */
  turnId?: string;
  /**
   * Set on a USER message sent via the "Générer un graphique" selection action:
   * the run_python plot directive rides `modelContent` (model-only), and the bubble
   * shows a "Graphique" tag chip instead of the raw instruction.
   */
  plotTag?: "graphique";
  /**
   * Set on a USER message sent with a SKILL: exactly like `plotTag`, the prompt
   * rides `modelContent` (model-only) and the bubble shows a clickable tag instead of
   * the raw instruction.
   *
   * `prompt` is a SNAPSHOT of what actually went out — the skill can be edited or
   * deleted afterwards, and the tag must keep showing what this turn really sent, not
   * today's version of it.
   *
   * ⚠️ `prompt` is REAL user text and may carry PII (a template routinely keeps the
   * example pasted in while drafting it), so it is stripped from the plaintext
   * localStorage copy alongside `modelContent` — see `ui/src/send/sendGuards.ts`.
   * `id`/`name` are kept: they are the tag, and it must render before the DB load.
   */
  competence?: { id: string; name: string; prompt?: string; servers?: string[] };
  /**
   * ⚠️ LEGACY — the old "workflow" tag, never WRITTEN again, always READ. The two
   * lists merged (a skill carries `servers`), but this field is PERSISTED
   * in everyone's history: removing it would erase the label of every turn
   * already sent with a routine, and the tool scope a following turn reuses from it.
   * So: we write `competence`, we read `competence ?? workflow`.
   */
  workflow?: { id: string; name: string; prompt?: string; servers?: string[] };
  /** « Demander » target tag — like `competence`, model-only context line; shape + at-rest rule: `./askTarget.ts`. */
  askTarget?: AskTarget;
  /**
   * EXPLICIT memory-ask feedback: how many durable facts the extraction just noted
   * for this turn (« retiens ça » → « N faits notés en mémoire » under the reply).
   * 0 is MEANINGFUL — « rien de durable à retenir », an answer, not an absence (silence
   * after an explicit ask reads as a failure). Set only on explicit asks — silent
   * extraction stays silent. A count, not sensitive.
   */
  memoryNoted?: number;
  /**
   * Ids of the memory cards CREATED by that explicit-ask extraction — powers the
   * caption's deep-link to the Memory page and its « Annuler » (remove the created
   * cards). OPAQUE ids (never entity names), resolved against the live memory store at
   * render — an id that no longer resolves means the card was since deleted/annulé.
   * Absent when the noted facts all merged into EXISTING cards (nothing cleanly
   * undoable). Not sensitive, safe in the plaintext localStorage snapshot.
   */
  memoryNotedIds?: string[];
  /**
   * Ids of the EXISTING cards that explicit-ask extraction UPDATED (a fact merged, an
   * attribute replaced — the card's `factsLog` holds the displaced sentence). Powers
   * the caption's « fiche mise à jour » segment + deep-link, so an update is visible
   * and inspectable instead of silent. Same opacity rule as `memoryNotedIds`: ids
   * only, resolved at render, never sensitive.
   */
  memoryUpdatedIds?: string[];
  /** The explicit extraction is RUNNING — the « Mise en mémoire… » caption. Transient:
   *  replaced by `memoryNoted`/`…Failed` on the result, purged on load
   *  (`clearStuckPending` — surviving a quit = a dead pass). Not sensitive. */
  memoryNotedPending?: boolean;
  /**
   * The explicit-ask extraction FAILED for real — model unreachable, or its reply
   * unusable even after a corrective retry. Distinct from `memoryNoted: 0` (« rien de
   * durable à retenir », an answer): this drives an honest « réessayez » caption,
   * because a real failure must never pass for either silence or an answer. Cleared
   * (unset) by a later successful ask on the same turn. Not sensitive.
   */
  memoryNotedFailed?: boolean;
  /**
   * MEMORY injected into THIS send (a USER message): the ids of the cards — plus the
   * `"profile"` sentinel — whose facts rode the system content, redacted. Drives the
   * « Mémoire utilisée » caption, so the injection is visible instead of silent. Same
   * opacity rule as `memoryNotedIds`: ids only, resolved at render, never sensitive.
   */
  memoryUsed?: string[];
  /**
   * MEMORY near-miss on this send (a USER message): the cards that could have
   * gone out but did NOT, for a SURPRISING reason — the injection
   * budget saturated, or a too-common first/last name deliberately ignored alone
   * (« Pierre » doesn't evoke the « Pierre Marché » card, on purpose). Makes the non-recall
   * diagnosable instead of invisible; NORMAL non-recall (no mention at all) stays
   * silent — the noise would teach people to ignore the caption. Opaque ids + a reason
   * code, resolved at render: never content, the same regime as `memoryUsed`.
   */
  memorySkipped?: { id: string; reason: "budget" | "homographe" }[];
  /**
   * Set when the AI redaction model was meant to run on this message but failed
   * (no/invalid key, unreachable…), so free-form PII (names, addresses…) may be
   * unmasked. A human-readable warning shown under the message.
   */
  redactionFailed?: string;
  /**
   * Set when a turn's tool calls went wrong, and WHOSE fault it was — the caption under
   * the reply says a different thing per kind, because each needs a different move from
   * the user. `tool`/`server` are names, `model` the id used.
   */
  toolStruggle?: {
    tool: string;
    server: string;
    model: string;
    /** `arg_error` = the model malformed the arguments and gave up; `no_tool_used` =
     *  it answered in prose without ever calling a tool (`tool` empty). Both deserve
     *  « changez de modèle ». The other two do NOT:
     *  `unknown_tool` = the model called a NONEXISTENT tool (no model can do that);
     *  `connector_error` = the CONNECTOR refused a call whose arguments matched
     *  its own schema — a more capable model would send the same call to the same refusal. */
    kind: "arg_error" | "no_tool_used" | "unknown_tool" | "connector_error";
  };
  /**
   * Token usage for an assistant turn produced by an API-key model. `model` is
   * the model id that produced it. Absent for keyless (web-session) replies,
   * which report no token counts. Drives per-conversation + per-model usage.
   *
   * `billed` records the ROUTING decision at send time (`resolveEffectivePlatform`):
   * `"subscription"` = the turn went through the app's metered gateway/credits,
   * `"byo"` = direct on the user's own provider key. Absent on turns persisted
   * before this was tracked — the usage view buckets those as « Inconnu » under a
   * billing filter rather than guessing. Not sensitive.
   */
  usage?: {
    model: string;
    inputTokens: number;
    outputTokens: number;
    billed?: "byo" | "subscription";
    /**
     * The counts are OURS (chars/4 over the wire), not the provider's. Set when the
     * turn ended without the terminal frame that carries the real numbers — the user
     * pressed Stop, the stream errored mid-answer, or the provider never reports usage
     * (openai-compat / local). Recording an estimate rather than nothing is the honest
     * option: the provider bills what it generated whether or not we received the
     * count, and the app's own gateway meters an estimate in exactly this case
     * (`apps/gateway/.../chat/handler.ts`, audit M5). Absent = measured, so a turn
     * persisted before this existed reads as measured, which it was.
     */
    estimated?: boolean;
  };
  /**
   * The model id that produced this assistant turn — pinned at send time so the
   * gutter logo/name reflect the model that ACTUALLY answered, not whatever the
   * conversation is set to now. Absent on user turns and on assistant turns from
   * before this was tracked (they fall back to the current model).
   */
  model?: string;
  /** AUTO mode: how the router-picked turn is billed (`"metered"` = gateway/credits,
   *  `"byo"` = own key, `"free"`), stamped at send time. Persisted: a MONEY claim must
   *  survive a reload, and deriving it from the conversation's CURRENT mode would
   *  mislabel pre-switch turns. Absent = the user picked the model themselves. */
  autoRouted?: "free" | "byo" | "metered";
  /**
   * Connector ids the assistant proposed because it could NOT fulfil the request
   * without an integration that isn't connected (e.g. the user asked to send an
   * email but Gmail isn't connected). Rendered under the bubble as small clickable
   * "integration cards" that deep-link to Réglages → MCP with that connector
   * preselected. Ids are `@openmasq/catalog/mcp` connector ids; the UI resolves
   * name/desc/tone/logo from the catalog (so the persisted schema stays display-free
   * and drift-proof). PERSISTED so the suggestion survives a reload. Absent/empty =
   * no suggestion (the normal case).
   */
  suggestedIntegrations?: string[];
  /**
   * When this assistant turn used an INTERNET-NAVIGATION tool (a web-search connector
   * or the agent browser) AND the conversation still redacts some of name/dob/address/
   * location/company, the store pins the OFFERABLE subset here so the bubble shows a
   * one-time, opt-in (pre-unchecked) form proposing to STOP redacting those categories
   * for this conversation — public web content's place/org/person names are usually its
   * substance, so redacting them makes the model summarise gibberish. Shown ONCE per
   * conversation (the store sets it on the FIRST such turn only). An EMPTY array means
   * the offer was resolved (applied or dismissed) — defined, so it is never re-offered,
   * and renders nothing. Org-forced categories are excluded (they can't be disabled).
   */
  webNavRedactOffer?: RedactCategoryKey[];
}
