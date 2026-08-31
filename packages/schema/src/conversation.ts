/**
 * The canonical persisted CONVERSATION shape — split out of `index.ts` (rule 1).
 * Same contract as the rest of the schema: PERSISTED data, so only ADD optional
 * fields; never rename/repurpose without a storage migration on both surfaces.
 */
import type { Message } from "./message";
import type { RedactCategoryKey } from "./index";

export interface Conversation {
  id: string;
  title: string;
  modelId: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  /**
   * Reversible redaction map (placeholder -> original value) for this
   * conversation. Lets us send placeholders to the model and restore the
   * originals in its reply. Persisted with the conversation.
   */
  redactionVault?: Record<string, string>;
  /**
   * original value -> kind (name/email/phone/company/number), reconstructed from
   * the persisted redactions so per-type highlight colours survive a reload even
   * when a message's in-memory redactedSpans are gone.
   */
  redactionKinds?: Record<string, string>;
  /**
   * PER-CONVERSATION secret salt for the value→fake mapping (a 31-bit int from a CSPRNG,
   * minted once on the first redacting send). Makes the fake a SECRET-KEYED function of the
   * real value instead of a public deterministic hash — so « Augustin Vaudel » maps to a
   * DIFFERENT fake in each conversation and a held fake can't be inverted by precomputing
   * the pool over a name dictionary. Stability WITHIN the conversation is the vault's job;
   * this only decorrelates ACROSS conversations. Absent ⇒ legacy deterministic mapping
   * (salt 0) — existing conversations keep their vault entries, only newly-minted fakes
   * differ. At rest it is treated like the vault (device-local, stripped from the plaintext
   * localStorage mirror when a Host DB owns it).
   */
  redactionSalt?: number;
  /**
   * WHAT THE MODEL SEES instead of a sensitive value, PINNED on the conversation:
   * `"fake"` (default) a plausible fake, `"token"` an opaque marker (`[PERSON1]`).
   * The global setting only decides at the CREATION of the first redaction; after that
   * this value is what governs, because switching mid-way would leave a
   * vault half fake half tokens — each entry stays reversible, but the history
   * sent back to the model would mix the two forms for the same people. Absent ⇒
   * `"fake"`, which is what every conversation written before this field is.
   */
  redactionMode?: "fake" | "token";
  /**
   * AUTO-MEMORY extraction cursor: how many leading messages of this conversation have
   * already been processed by the memory extractor (desktop). Not sensitive (a count).
   */
  memoryWatermark?: number;
  /**
   * "No memory in this conversation" (rules modal): cuts memory INJECTION,
   * the memory-search tool AND silent extraction for this
   * conversation — in both directions, else the switch would be lying. An EXPLICIT
   * request ("remember that…") is still honored: it is its own consent, the same rule
   * as the global extraction setting. Absent ⇒ memory active (the default).
   */
  memoryOff?: boolean;
  /**
   * original value -> first-seen epoch ms. EXTENSION-ONLY today (the desktop does
   * not persist this): lets the extension audit log + "today" stats use a real
   * per-value time instead of the whole conversation's last-activity time. Kept on
   * the canonical type so the two surfaces share ONE schema; harmless on desktop.
   */
  redactionTimes?: Record<string, number>;
  /**
   * NEUTRAL MARKS display mode for this conversation: redacted spans render as plain
   * text with a small category-coloured badge above them, and only take their full
   * highlight on hover. Pure DISPLAY preference — detection, vault and wire are
   * untouched (flipping it redacts neither more nor less). Absent ⇒ off (classic
   * highlighted marks).
   */
  neutralMarks?: boolean;
  /**
   * Per-conversation redaction category OVERRIDE (sparse). Only the keys the user
   * explicitly set here differ from the global `Settings.redactCategories`; any
   * absent key inherits the global default. Lets one chat redact more/less than
   * the rest without touching global settings.
   */
  redactCategories?: Partial<Record<RedactCategoryKey, boolean>>;
  /**
   * REAL values the user chose to un-redact for THIS conversation (clicked
   * "suspendre"/"supprimer" on a redacted element). They're added to the redaction
   * `keep` allow-list so the next message no longer redacts them, and shown in clear.
   * "Suspendre" keeps the vault mapping (reversible); "supprimer" also drops the vault
   * entry. Org-forced categories can never be added here (enforced in the store).
   */
  revealedValues?: string[];
  /**
   * User-FORCED redactions (composer text-selection → "Redact" → chosen type):
   * each `{ value, category }` is redacted for THIS conversation — in the current
   * message AND every later one — as the chosen canonical category token
   * (NAME/EMAIL/ORG/…), even if the detectors wouldn't catch it or that category is
   * disabled. Undone by revealing the value (the audit journal / a mark's hover card), which drops it
   * from here. `keep`/`revealedValues` win over it (the reveal path).
   */
  forcedRedactions?: { value: string; category: string }[];
  /**
   * For keyless web-session providers: the id of the matching web thread
   * (e.g. chatgpt.com/c/<id> or claude.ai/chat/<id>). Saved after the first
   * message so later messages go to the same thread instead of a new one.
   */
  sessionConversationId?: string;
  /**
   * Redaction applied to ATTACHED FILES (visible mode), kept separate from
   * message redactions so the log can distinguish "📎 file" from a typed message.
   */
  fileRedactions?: {
    name: string;
    spans: { value: string; kind: string }[];
    at: number;
  }[];
  /**
   * Write-idempotency ledger (retry-safety): the opaque keys of side-effecting tool
   * calls that have ALREADY COMPLETED, keyed on (`Message.turnId`, tool, wire args) by
   * the agent loop (see `ui/src/agent/writeIdempotency.ts`). A "Réessayer" re-runs the
   * turn but the loop recognises a key here and SKIPS the real call — so an action that
   * already succeeded is not repeated. Keys are hashes of redacted (fake) args → no PII,
   * kept in the plaintext localStorage snapshot. Bounded (the store trims oldest).
   */
  writeLedger?: string[];
  /**
   * Checkpoint of the agentic turn currently in flight — the WIRE (redacted) transcript the
   * model has accumulated, so a turn cut off by a crash, a quit or an auto-update RESUMES
   * instead of restarting. Companion to `writeLedger`: the ledger says which side effects
   * already happened, this says what the model already learned.
   *
   * ⚠️ It holds what LEFT the machine (wire text: fakes, but also every non-protected word
   * of the conversation and of the pages it read), so its at-rest home is the encrypted Host
   * DB — `stripUserContentForLocal` drops it from the localStorage snapshot, exactly like
   * `Message.modelContent`. Cleared when the turn settles; expires on age
   * (`ui/src/agent/turnCheckpoint.ts`).
   */
  turnCheckpoint?: {
    turnId: string;
    at: number;
    messages: unknown[];
  };
  /**
   * Compaction of the conversation's OLDEST turns, so a long thread degrades into a recap
   * instead of silently losing its brief (`ui/src/send/contextSummary.ts`). Built from the
   * WIRE turns — fakes the model already received — so it is egress-neutral to produce and
   * injectable as-is, with no re-redaction step.
   *
   * ⚠️ It is bound to THIS conversation: fakes are salted per conversation, so the same
   * placeholder names someone else elsewhere. Never copy it onto another thread.
   */
  contextSummary?: {
    throughTurn: number;
    text: string;
    at: number;
    model?: string;
  };
}
