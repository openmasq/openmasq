/* Le rendu CONSOLE d'une entrée wire (le `%c` devtools + sa copie épinglée de la
   palette) vit dans `wireTrace.ts` — ce fichier est l'ANNEAU du journal seul, et la
   séparation est ce qui garde chacun sous le cap des 300 lignes. */

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
  // ⚠️ Sur un tour AGENTIQUE ce coût est le CUMUL de tous les échanges modèle du tour,
  // pas celui de ce message-là : le journal du 27/07/2026 affichait « 28 079 entrée »
  // sous un message de 221 caractères, à côté d'un « 13 938 entrée » au tour 1 qui
  // semblait le contredire. `modelTurns` porte le nombre d'échanges couverts, et
  // `wireTokenSummary` le DIT quand il y en a plus d'un.
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
      // `cachedInputTokens` = la PART de `inputTokens` servie par le cache du provider
      // (préfixe stable : prompt système + schémas d'outils). Un tour agentique renvoie
      // tout l'historique, donc c'est ce ratio — pas l'entrée brute — qui dit si le
      // préfixe est réutilisé ou refacturé plein tarif à chaque échange.
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
      // Les entrées NON ESTAMPILLÉES sont jetées. Aucun émetteur n'en produit (un chat pas
      // encore créé estampille `DRAFT_CONV`), donc une entrée sans `conv` dans le blob ne
      // peut venir que d'un anneau écrit AVANT que l'estampillage soit complet (11/08).
      // Les garder coûtait deux fois : `debugScope.ts` les montrait dans CHAQUE
      // conversation — « en changeant de conversation le journal reste le même » — et
      // elles occupaient des places de l'anneau de 200 que rien ne peut plus afficher.
      // Un événement d'app légitime est bon marché à perdre : il se ré-émet.
      const stored = parsed as DebugEntry[];
      buffer = stored.filter((e) => e.conv != null).slice(-MAX_ENTRIES);
      // Continue ids past the hydrated ones so `updateDebug` can never patch a
      // resurrected entry by id collision.
      seq = buffer.reduce((m, e) => Math.max(m, Number(String(e.id).slice(1)) || 0), seq);
      listeners.forEach((l) => l());
      // Ré-écrire UNE fois quand on a jeté quelque chose, sinon le blob les garde jusqu'à
      // la prochaine entrée — et un journal qu'on n'alimente plus ne se nettoierait jamais.
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
 * La conversation-BROUILLON. Un fichier déposé sur un chat NEUF travaille pour une
 * conversation qui n'existe pas encore (elle naît au premier envoi) : ses entrées
 * (OCR, redaction de document) partaient donc SANS `conv` — or une entrée sans `conv`
 * est un événement d'APP, montré dans TOUTES les conversations, et l'anneau est persisté
 * par compte : le journal de chaque conversation embarquait le redaction de documents
 * d'un autre fil, indéfiniment. Les émetteurs du dépôt estampillent CE sentinel à la
 * place, et le premier envoi l'adopte (`adoptDraftDebug`). La valeur ne peut pas
 * entrer en collision avec un id réel (les ids sont des uid alphanumériques).
 */
export const DRAFT_CONV = "·brouillon·";

/**
 * Le premier envoi vient de CRÉER la conversation : les entrées du brouillon lui
 * appartiennent — re-clé en place. Résiduel assumé : deux chats neufs menés de front
 * partagent le même brouillon (exactement comme leur mise en scène de fichiers,
 * `stagedFiles` clé ""), donc le premier qui envoie adopte tout.
 */
export function adoptDraftDebug(convId: string): void {
  if (!buffer.some((e) => e.conv === DRAFT_CONV)) return;
  buffer = buffer.map((e) => (e.conv === DRAFT_CONV ? { ...e, conv: convId } : e));
  listeners.forEach((l) => l());
  scheduleSave();
}

// Qui peut VOIR quelle entrée (brouillon compris) est une question de confidentialité,
// pas de stockage : la règle vit dans `debugScope.ts` (règle 10). Ici ne restent que le
// sentinel et l'adoption, qui MUTENT l'anneau.

/** Record a debug entry (no-op unless capture is on). `convId` scopes it to one
 *  conversation (stamped at emit time so concurrent tab turns stay separate); omit
 *  for an app-level event — jamais pour du travail de conversation : un chat pas
 *  encore créé estampille `DRAFT_CONV`. Returns the new entry's id (or "" when
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
