/* The CONSOLE rendering of a wire entry (the `%c` devtools + its pinned copy of the
   palette) lives in `wireTrace.ts` — this file is the journal's RING alone, and the
   separation is what keeps each one under the 300-line cap. */

/* ── In-app debug log buffer ──────────────────────────────────────────────
   So the raw DevTools console isn't required: wire messages, MCP tool calls and
   send errors are captured into a bounded ring buffer that the DebugLogModal
   subscribes to. Capture is off unless the app's debug mode is on. */

/** A redacted↔original mapping row, so a tool/redaction entry can show its 2-by-2
 *  substitutions (what the model saw ↔ the real value) — not just a flat list. */
export interface DebugPair {
  /** The value that LEFT the machine (fake / placeholder). */
  token: string;
  /** The ORIGINAL value it stands for. */
  original: string;
  /** Fine category label (e.g. "email"), for colour + display. */
  label?: string;
  /** Highlight tone class (coral/blue/…) matching the category. */
  tone?: string;
}

/** One wire message of a turn's request — role + (capped) wire-form content. */
export interface TurnMessage {
  role: string;
  content: string;
  /** Set when `content` was capped for the ring buffer (original length). */
  truncatedFrom?: number;
}

// `conv` scopes an entry to ONE conversation (the send/turn/tool/wire it belongs to),
// so the journal shows the ACTIVE conversation's activity, not every tab's interleaved.
// Stamped by `pushDebug`'s 2nd arg at emit time (never a shared ambient — concurrent
// per-tab turns each carry their OWN id). Undefined = an app-level event (no send), shown
// in every conversation. The renderer filters on it (`DebugLogModal`).
export type DebugEntry =
  // `inputTokens`/`outputTokens` are patched in AFTER the model replies (the send
  // reports usage on `onDone`/`onUsage`). Absent when the provider reports no usage
  // (openai-compat/local).
  // ⚠️ On an AGENTIC turn this cost is the CUMULATIVE total of all the turn's model
  // exchanges, not this particular message's: the 27/07/2026 journal showed « 28,079 input »
  // under a 221-character message, next to a « 13,938 input » at turn 1 that
  // seemed to contradict it. `modelTurns` carries the number of exchanges covered, and
  // `wireTokenSummary` SAYS so when there's more than one.
  | { id: string; at: number; conv?: string; type: "wire"; model: string; text: string; vault?: Record<string, string>; kinds?: Record<string, string>; inputTokens?: number; outputTokens?: number; cachedInputTokens?: number; modelTurns?: number }
  | { id: string; at: number; conv?: string; type: "tool"; name: string; ok: boolean; args?: string; result?: string; error?: string; pairs?: DebugPair[]; vault?: Record<string, string>; kinds?: Record<string, string> }
  // ONE model exchange of the agentic loop (tour N): what was ADDED to the request
  // since the previous tour (`request` — the rest is the prior tours, already logged),
  // the offered tool set, and the raw response (prose + tool calls + stopReason +
  // usage). On FAILURE, `request` is the COMPLETE context (`requestFull`) + `error` —
  // the dump that lets a provider 400 be diagnosed from the journal alone. All content
  // is WIRE form (redacted); `vault`/`kinds` drive the hover-reveal like a wire entry.
  | {
      id: string; at: number; conv?: string; type: "turn"; model: string; turn: number; ok: boolean;
      request: TurnMessage[]; requestFull?: boolean; msgCount: number;
      toolsOffered: number; toolNames?: string[]; toolChoice?: string;
      text?: string; toolCalls?: { name: string; args: string }[]; stopReason?: string;
      // `cachedInputTokens` = the SHARE of `inputTokens` served by the provider's cache
      // (stable prefix: system prompt + tool schemas). An agentic turn resends
      // the whole history, so it's this ratio — not the raw input — that says whether the
      // prefix is reused or re-billed at full price on every exchange.
      inputTokens?: number; outputTokens?: number; cachedInputTokens?: number; ms?: number; error?: string;
      vault?: Record<string, string>; kinds?: Record<string, string>;
    }
  | { id: string; at: number; conv?: string; type: "error"; scope: string; message: string }
  // A live LIFECYCLE step of the agentic loop (model turn / tool dispatch / write
  // confirmation / abort) — streamed in as it happens so the Debug Log shows a
  // running timeline instead of a blank while a slow model generates. `scope` is
  // the phase family (loop/model/tool/confirm/system), `detail` a short blurb, and
  // `ms` the measured duration once the step ends (filled via `updateDebug`). `ok`
  // false marks a failed/interrupted step. NO redacted content — labels only.
  | { id: string; at: number; conv?: string; type: "phase"; scope: string; label: string; detail?: string; ms?: number; ok?: boolean };

type NewEntry =
  | Omit<Extract<DebugEntry, { type: "wire" }>, "id" | "at">
  | Omit<Extract<DebugEntry, { type: "tool" }>, "id" | "at">
  | Omit<Extract<DebugEntry, { type: "turn" }>, "id" | "at">
  | Omit<Extract<DebugEntry, { type: "error" }>, "id" | "at">
  | Omit<Extract<DebugEntry, { type: "phase" }>, "id" | "at">;

/** Fields of a `phase` entry that a later `updateDebug` may overwrite in place. */
export type PhasePatch = Partial<Pick<Extract<DebugEntry, { type: "phase" }>, "label" | "detail" | "ms" | "ok">>;
/** Fields of a `wire` entry patched in once the model reports token usage (post-send). */
export type WirePatch = Partial<Pick<Extract<DebugEntry, { type: "wire" }>, "inputTokens" | "outputTokens" | "cachedInputTokens" | "modelTurns">>;

const MAX_ENTRIES = 200;
let buffer: DebugEntry[] = [];
let capture = false;
let seq = 0;
const listeners = new Set<() => void>();

/* ── Persistence ─────────────────────────────────────────────────────────────
   The ring survives a reload/restart through `DbHost.saveDebugJournal` — the
   per-account ENCRYPTED DB, the vault's own at-rest home. That is the ONLY sink
   this buffer may ever gain (entries hold wire text + real vault values): never a
   plaintext file, never localStorage, never network. Saves are whole-buffer,
   debounced; absent host slot (preview / mobile) ⇒ memory-only, as before. */

export interface DebugStore {
  save(json: string): Promise<void>;
  load(): Promise<string | null>;
}

const SAVE_DEBOUNCE_MS = 800;
let store: DebugStore | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSave(): void {
  if (!store) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    // Best-effort: a failed save keeps the in-memory ring; next mutation retries.
    void store?.save(JSON.stringify(buffer)).catch(() => {});
  }, SAVE_DEBOUNCE_MS);
}

/**
 * Re-point persistence at the signed-in account's store and hydrate the ring from
 * it. The buffer is RESET first — on an account switch, account A's entries must
 * never linger in (or be saved into) account B's journal, so a missing/corrupt
 * blob hydrates to empty rather than keeping the previous account's ring.
 * `null` = signed out / no encrypted DB: memory-only, previous ring dropped.
 */
export async function attachDebugStore(s: DebugStore | null): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  store = s;
  buffer = [];
  listeners.forEach((l) => l());
  if (!s) return;
  try {
    const raw = await s.load();
    if (store !== s) return; // a later attach (fast account switch) won the race
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed)) {
      // UN-STAMPED entries are dropped. No emitter produces any (a chat not
      // yet created stamps `DRAFT_CONV`), so an entry with no `conv` in the blob can
      // only come from a ring written BEFORE stamping was complete (11/08).
      // Keeping them cost twice over: `debugScope.ts` showed them in EVERY
      // conversation — « switching conversation, the journal stays the same » — and
      // they occupied slots of the 200-entry ring that nothing can display any more.
      // A legitimate app event is cheap to lose: it gets re-emitted.
      const stored = parsed as DebugEntry[];
      buffer = stored.filter((e) => e.conv != null).slice(-MAX_ENTRIES);
      // Continue ids past the hydrated ones so `updateDebug` can never patch a
      // resurrected entry by id collision.
      seq = buffer.reduce((m, e) => Math.max(m, Number(String(e.id).slice(1)) || 0), seq);
      listeners.forEach((l) => l());
      // Re-write ONCE when something got dropped, otherwise the blob keeps them until
      // the next entry — and a journal that's no longer fed would never clean itself up.
      if (buffer.length !== stored.length) scheduleSave();
    }
  } catch {
    /* corrupt/absent blob → start empty (already reset) */
  }
}

/** Enable/disable capturing entries into the buffer (driven by Settings → debug). */
export function setDebugCapture(on: boolean): void {
  capture = on;
}
/** True while capture is on — so an emitter can skip BUILDING an expensive entry
 *  (a per-tour request delta) when it would be dropped anyway. */
export function isDebugCapture(): boolean {
  return capture;
}
export function getDebugLog(): readonly DebugEntry[] {
  return buffer;
}
/** Clear the buffer. With `convId`, drop ONLY that conversation's entries (the modal's
 *  « Vider » clears the conversation you're looking at, not another tab's activity);
 *  without it, everything. */
export function clearDebugLog(convId?: string): void {
  buffer = convId ? buffer.filter((e) => e.conv !== convId) : [];
  listeners.forEach((l) => l());
  scheduleSave();
}
export function subscribeDebugLog(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/**
 * The DRAFT conversation. A file dropped on a NEW chat works for a
 * conversation that doesn't exist yet (it's born on the first send): its entries
 * (OCR, document redaction) used to go out WITH NO `conv` — but an entry with no `conv`
 * is an APP event, shown in EVERY conversation, and the ring is persisted
 * per account: each conversation's journal was carrying another thread's document
 * redaction, indefinitely. The staging's emitters now stamp THIS sentinel
 * instead, and the first send adopts it (`adoptDraftDebug`). The value cannot
 * collide with a real id (ids are alphanumeric uids).
 */
export const DRAFT_CONV = "·brouillon·";

/**
 * The first send just CREATED the conversation: the draft's entries
 * belong to it — re-keyed in place. Accepted residual: two new chats driven side by
 * side share the same draft (exactly like their file staging,
 * `stagedFiles` key ""), so whichever sends first adopts everything.
 */
export function adoptDraftDebug(convId: string): void {
  if (!buffer.some((e) => e.conv === DRAFT_CONV)) return;
  buffer = buffer.map((e) => (e.conv === DRAFT_CONV ? { ...e, conv: convId } : e));
  listeners.forEach((l) => l());
  scheduleSave();
}

// Who can SEE which entry (draft included) is a matter of privacy,
// not storage: the rule lives in `debugScope.ts` (rule 10). Only the
// sentinel and the adoption, which MUTATE the ring, remain here.

/** Record a debug entry (no-op unless capture is on). `convId` scopes it to one
 *  conversation (stamped at emit time so concurrent tab turns stay separate); omit
 *  for an app-level event — never for conversation work: a chat not
 *  yet created stamps `DRAFT_CONV`. Returns the new entry's id (or "" when
 *  capture is off) so a live `phase` step can be refined via `updateDebug`. */
export function pushDebug(e: NewEntry, convId?: string): string {
  if (!capture) return "";
  seq += 1;
  const id = `d${seq}`;
  const entry = { ...e, id, at: Date.now(), ...(convId ? { conv: convId } : {}) } as DebugEntry;
  const next = [...buffer, entry];
  buffer = next.length > MAX_ENTRIES ? next.slice(-MAX_ENTRIES) : next;
  listeners.forEach((l) => l());
  scheduleSave();
  return id;
}

/** Refine an existing entry in place — a `phase` step (running clock, final ms) or a
 *  `wire` entry (its token cost, patched in once the model replies). No-op if capture
 *  is off or the entry has already scrolled out of the ring. */
export function updateDebug(id: string, patch: PhasePatch | WirePatch): void {
  if (!capture || !id) return;
  const i = buffer.findIndex((e) => e.id === id);
  if (i < 0 || (buffer[i].type !== "phase" && buffer[i].type !== "wire")) return;
  buffer = buffer.slice();
  buffer[i] = { ...buffer[i], ...patch } as DebugEntry;
  listeners.forEach((l) => l());
  scheduleSave();
}
