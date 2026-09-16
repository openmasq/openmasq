/**
 * The canonical persisted CONVERSATION shape. PERSISTED data: only ADD optional fields;
 * never rename or repurpose one without a storage migration on every surface.
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
  /** Reversible redaction map (placeholder → original) for this conversation. */
  redactionVault?: Record<string, string>;
  /** original value → kind, reconstructed from the persisted redactions so per-type
   *  highlight colours survive a reload. */
  redactionKinds?: Record<string, string>;
  /**
   * PER-CONVERSATION salt for the value→fake mapping (31-bit CSPRNG int, minted on the
   * first redacting send). It SHIFTS the mapping off the public deterministic hash so the
   * same value maps to a DIFFERENT fake in each conversation. ⚠️ Not a key: one known
   * (value, fake) pair recovers it. Absent ⇒ legacy deterministic mapping (salt 0). At
   * rest treated like the vault (stripped from the plaintext mirror when a Host DB owns it).
   */
  redactionSalt?: number;
  /**
   * PER-CONVERSATION KEY (32 CSPRNG bytes, hex) for the value→fake mapping: every seed is
   * `HMAC-SHA256(key, category ‖ value)`, so a known pair reveals nothing about any other
   * value. Minted on the first redacting send, then fixed. A conversation that predates it
   * keeps its salt AND gets a key: vaulted values keep their fakes, only NEW values use the
   * key. At rest: encrypted DB only (`send/sendGuards.ts`).
   */
  redactionKey?: string;
  /**
   * WHAT THE MODEL SEES instead of a sensitive value, PINNED on the conversation: `"fake"`
   * (default) or `"token"` (`[PERSON1]`). The global setting decides only at the first
   * redaction; switching mid-way would send the model a history mixing both forms.
   */
  redactionMode?: "fake" | "token";
  /** AUTO-MEMORY extraction cursor: leading messages already processed. A count. */
  memoryWatermark?: number;
  /** "No memory in this conversation": cuts INJECTION, the memory-search tool AND silent
   *  extraction, in both directions. An EXPLICIT « retiens que… » is still honoured. */
  memoryOff?: boolean;
  /** original value → first-seen epoch ms. Not persisted by the desktop; kept on the
   *  canonical type so every surface shares ONE schema. */
  redactionTimes?: Record<string, number>;
  /** NEUTRAL MARKS display mode: redacted spans render as plain text with a small badge and
   *  highlight on hover. Pure DISPLAY preference — detection, vault and wire are untouched. */
  neutralMarks?: boolean;
  /** Per-conversation category OVERRIDE (sparse): absent keys inherit `Settings.redactCategories`. */
  redactCategories?: Partial<Record<RedactCategoryKey, boolean>>;
  /** REAL values the user chose to un-redact for THIS conversation (« suspendre » keeps the
   *  vault mapping, « supprimer » drops it). Added to the `keep` allow-list. Org-forced
   *  categories can never land here (enforced in the store). */
  revealedValues?: string[];
  /** User-FORCED redactions (selection → « Masquer » → a type): each value is redacted for
   *  THIS conversation, current message and later ones, as the chosen canonical category,
   *  whatever the detectors say. Undone by revealing the value; `keep`/`revealedValues` win. */
  forcedRedactions?: { value: string; category: string }[];
  /** For keyless web-session providers: the id of the matching web thread, so later
   *  messages go to the same thread. */
  sessionConversationId?: string;
  /** Redaction applied to ATTACHED FILES, kept separate so the log can tell a file from a message. */
  fileRedactions?: {
    name: string;
    spans: { value: string; kind: string }[];
    at: number;
  }[];
  /**
   * Write-idempotency ledger: opaque keys of side-effecting tool calls that ALREADY
   * COMPLETED, keyed on (`Message.turnId`, tool, wire args) by the agent loop
   * (`ui/src/agent/writeIdempotency.ts`). A retry SKIPS a call whose key is here. Hashes of
   * redacted args → no PII, kept in the plaintext snapshot. Bounded (oldest trimmed).
   */
  writeLedger?: string[];
  /**
   * Checkpoint of the agentic turn in flight — the WIRE transcript, so a turn cut off by a
   * crash or an update RESUMES. Companion to `writeLedger`. ⚠️ It holds what LEFT the
   * machine (fakes, but every non-protected word too), so its home is the encrypted Host DB
   * (`stripUserContentForLocal`). Cleared when the turn settles; expires on age
   * (`ui/src/agent/turnCheckpoint.ts`).
   */
  turnCheckpoint?: {
    turnId: string;
    at: number;
    messages: unknown[];
  };
  /**
   * Compaction of the OLDEST turns (`ui/src/send/contextSummary.ts`), built from the WIRE
   * turns so it is egress-neutral and injectable as-is. ⚠️ Bound to THIS conversation:
   * fakes are salted per conversation. Never copy it onto another thread.
   */
  contextSummary?: {
    throughTurn: number;
    text: string;
    at: number;
    model?: string;
  };
}
