import Debug from "debug";

const debug = Debug("openmasq:net");

/**
 * The egress journal — what left this machine, and what was refused.
 *
 * The product's promise is about egress, and the Journal tab could until now only answer
 * "what was redacted". It could not answer the question a user (or a DPO) actually asks:
 * *which hosts did this app talk to*. This is that record, written where every outbound
 * decision already converges — `assertPublicUrl`, the shared SSRF floor called by the agent
 * browser, the direct connectors, `safeFetch` per redirect hop and the Python egress proxy.
 *
 * ⚠️ **HOST, PORT AND SCHEME ONLY — never the path or the query.** `net.ts` already refuses
 * to log a full URL because a signed export URL carries its token in the query string; a
 * journal is a worse place to keep one than a log line, because it persists. `originOf`
 * is the only constructor, and it throws the rest away rather than trusting a caller.
 * The verdict's `reason` is our OWN sentence, never the remote's response.
 *
 * At rest it is per-account and encrypted like everything else (`db/egressJournal.ts`).
 * In RAM it is a bounded ring in front of that store: an agentic turn can issue hundreds of
 * hops, and a DB write per hop would be felt. The flush is debounced and also runs on quit;
 * losing the last few seconds of the journal on a hard kill is acceptable — this record is
 * evidence for the user, not a security control anything else depends on.
 */

export type EgressVerdict = "allowed" | "refused";

export interface EgressRecord {
  at: number;
  /** `https://example.com:8443` — scheme + host + non-default port. Never a path. */
  origin: string;
  /** Which subsystem asked. Free-form but stable: `browser`, `connector`, `fetch-url`,
   *  `link-preview`, `web-fetch-many`, `embeddings`, `python`, `mcp-connect`. */
  source: string;
  verdict: EgressVerdict;
  /** Present on a refusal, and only ever OUR wording (`private address`, `DNS failure`). */
  reason?: string;
}

/** Bounded ring: an agentic session issues a lot of hops, and this is a user-facing
 *  record, not an audit of record. Oldest entries fall off. */
const MAX_ENTRIES = 2_000;

/** Batch window. Long enough that a burst of redirect hops costs one write. */
const FLUSH_DEBOUNCE_MS = 3_000;

export interface EgressSink {
  load(): Promise<EgressRecord[]>;
  save(records: EgressRecord[]): Promise<void>;
}

let ring: EgressRecord[] = [];
let sink: EgressSink | null = null;
let flushTimer: NodeJS.Timeout | null = null;
let dirty = false;

/** Scheme + host + non-default port, with the path, query and credentials dropped.
 *  Returns null for a URL we can't parse — an unparseable target is not journalled
 *  rather than journalled wrong. */
export function originOf(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    const defaultPort = u.protocol === "https:" ? "443" : "80";
    const port = u.port && u.port !== defaultPort ? `:${u.port}` : "";
    return `${u.protocol}//${u.hostname.toLowerCase()}${port}`;
  } catch {
    return null;
  }
}

function scheduleFlush(): void {
  dirty = true;
  if (flushTimer || !sink) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushEgressLog();
  }, FLUSH_DEBOUNCE_MS);
  flushTimer.unref?.();
}

/** Record one decision. Never throws — a journal failure must not become an egress failure,
 *  in either direction: a refused host stays refused, an allowed one stays allowed. */
export function noteEgress(record: Omit<EgressRecord, "at"> & { at?: number }): void {
  try {
    ring.push({ at: record.at ?? Date.now(), origin: record.origin, source: record.source, verdict: record.verdict, ...(record.reason ? { reason: record.reason } : {}) });
    if (ring.length > MAX_ENTRIES) ring = ring.slice(-MAX_ENTRIES);
    scheduleFlush();
  } catch (e) {
    debug("egress journal note failed: %s", e instanceof Error ? e.message : String(e));
  }
}

/** The `assertPublicUrl` adapter: takes the raw URL, keeps only its origin. */
export function noteEgressUrl(url: string, source: string, verdict: EgressVerdict, reason?: string): void {
  const origin = originOf(url);
  if (!origin) return;
  noteEgress({ origin, source, verdict, ...(reason ? { reason } : {}) });
}

/** Newest first, optionally filtered. Reads the RAM ring, which the account adopt below
 *  hydrates from the store — so a freshly-launched app shows the previous sessions. */
export function listEgress(opts: { limit?: number; verdict?: EgressVerdict; source?: string } = {}): EgressRecord[] {
  const { limit = 500, verdict, source } = opts;
  const out: EgressRecord[] = [];
  for (let i = ring.length - 1; i >= 0 && out.length < limit; i--) {
    const r = ring[i]!;
    if (verdict && r.verdict !== verdict) continue;
    if (source && r.source !== source) continue;
    out.push(r);
  }
  return out;
}

export async function flushEgressLog(): Promise<void> {
  if (!sink || !dirty) return;
  dirty = false;
  const snapshot = ring.slice();
  try {
    await sink.save(snapshot);
  } catch (e) {
    dirty = true;
    debug("egress journal flush failed: %s", e instanceof Error ? e.message : String(e));
  }
}

/**
 * Point the journal at an account's store, hydrating the ring from it.
 *
 * Called on sign-in and on account SWITCH, alongside `db.setUser` — and it must RESET
 * first, for the same reason the debug journal does: the ring holds one account's browsing
 * hosts, which is exactly the cross-account leak the per-account DB exists to prevent.
 * `null` (signed out) leaves the journal detached, so anything egressing before sign-in is
 * simply not recorded rather than recorded into the next account's file.
 */
export async function attachEgressSink(next: EgressSink | null): Promise<void> {
  await flushEgressLog().catch(() => {});
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  ring = [];
  dirty = false;
  sink = next;
  if (!next) return;
  try {
    const loaded = await next.load();
    ring = loaded.slice(-MAX_ENTRIES);
  } catch (e) {
    debug("egress journal load failed: %s", e instanceof Error ? e.message : String(e));
  }
}

/** Test seam — the ring is module state, so a suite must be able to start clean. */
export function resetEgressLogForTest(): void {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
  ring = [];
  sink = null;
  dirty = false;
}
