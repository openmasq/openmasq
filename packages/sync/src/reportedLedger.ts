import type { PassphraseStore } from "./accountPassphrase";

/**
 * The DEDUPLICATION ledger for org audit — per account, and with no value in the clear.
 *
 * ══ WHAT IT USED TO DO ═══════════════════════════════════════════════════════════
 *
 * An organization's facts table is append-only: a redacted value must only be
 * counted once, hence this ledger of what has already been reported. It had two flaws,
 * and they're independent of one another:
 *
 *  1. **A single key per device.** Values reported by account A prevented
 *     B's organization from counting its own — a silent UNDER-COUNT, in either
 *     direction, on a dashboard an administrator reads as the truth.
 *  2. **It stored the REAL values in the clear.** Real PII (names, emails, numbers)
 *     sat in local storage — that is, on the desktop, Chromium's LevelDB in the
 *     clear on disk: exactly what secret stores refuse on principle.
 *     Yet the ledger never needed the values: it needs to know IF a value is
 *     already there. A hash answers that question and no other.
 *
 * ══ THE HASH, AND ITS SALT ════════════════════════════════════════════════════
 *
 * SHA-256 on `<salt>:<value>`, truncated to 128 bits (collisions are out of reach there, and
 * a collision would in any case only fail to recount a value once). The SALT is drawn
 * randomly once per install and stored alongside.
 *
 * ⚠️ What it buys, exactly: without it, an email or a phone number can be recovered by a
 * simple precomputed table — the space of those values is small. With it, a
 * generic table becomes useless. It does NOT protect against someone who has the file AND
 * tests one specific value: they have the salt too. It's a defense against bulk
 * reading (a backup, a recovered disk), not against a targeted attack — and that's the
 * defense that matches the real risk of a local ledger.
 */

/** What the caller handles: VALUES. Hashes never leave here.
 *  ⚠️ `open()` loads ONCE — `seen` per value would re-read storage on every turn of a
 *  loop that counts the entries across all vaults. */
export interface OpenedLedger {
  /** Has this value already been reported (so: not to be recounted)? */
  seen(value: string): Promise<boolean>;
  /** Mark values as reported and PERSIST. Only call after a successful
   *  send: a backend outage must leave the delta to retry, not lose it. */
  mark(values: readonly string[]): Promise<void>;
}

export interface ReportedLedger {
  open(): Promise<OpenedLedger>;
}

export interface ReportedLedgerOptions {
  store: PassphraseStore;
  /** The old key, account-less — migrated then adopted once. */
  legacyKey: string;
  accountId: () => Promise<string | null | undefined>;
}

const HEX = /^[0-9a-f]{32}$/;

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

function randomHex(bytes: number): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function reportedLedger(opts: ReportedLedgerOptions): ReportedLedger {
  const saltKey = `${opts.legacyKey}:salt`;
  const markerKey = `${opts.legacyKey}:adopted`;
  const scoped = (id: string) => `${opts.legacyKey}:${id}`;
  const memo = new Map<string, string>();
  let saltPromise: Promise<string> | null = null;

  const salt = (): Promise<string> =>
    (saltPromise ??= (async () => {
      const existing = await opts.store.get(saltKey);
      if (existing) return existing;
      const fresh = randomHex(16);
      await opts.store.set(saltKey, fresh);
      return fresh;
    })());

  async function digest(value: string): Promise<string> {
    const hit = memo.get(value);
    if (hit) return hit;
    const h = (await sha256Hex(`${await salt()}:${value}`)).slice(0, 32);
    memo.set(value, h);
    return h;
  }

  const readList = async (key: string): Promise<string[]> => {
    const raw = await opts.store.get(key);
    if (!raw) return [];
    try {
      const v: unknown = typeof raw === "string" ? JSON.parse(raw) : raw;
      return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
    } catch {
      return [];
    }
  };
  const writeList = (key: string, list: string[]): Promise<void> =>
    opts.store.set(key, JSON.stringify([...new Set(list)]));

  /**
   * The old key, in two stages — and the order is the fix:
   *
   *  1. **The clear text disappears RIGHT AWAY**, even signed out: entries that don't have the
   *     shape of a hash are hashed and rewritten IN PLACE. Waiting for a connection
   *     would leave PII on disk indefinitely on a machine where nobody ever
   *     reconnects, and that's the more concrete of the two flaws.
   *  2. **Per-account adoption, on the other hand, waits for a connection**: the migrated ledger goes to the
   *     FIRST connected account (same policy as the passphrase), then a marker closes the
   *     door and the shared key disappears. Removing it without having given it to anyone would
   *     re-report the whole history — an OVER-count, the other half of the flaw.
   */
  async function migrate(id: string | null): Promise<string[]> {
    const legacy = await readList(opts.legacyKey);
    if (legacy.length) {
      const needsHashing = legacy.some((v) => !HEX.test(v));
      if (needsHashing) {
        const hashed = await Promise.all(legacy.map((v) => (HEX.test(v) ? v : digest(v))));
        await writeList(opts.legacyKey, hashed);
        legacy.splice(0, legacy.length, ...hashed);
      }
    }
    if (!id) return []; // signed out: the clear text is gone, adoption waits
    if (await opts.store.get(markerKey)) return [];
    await opts.store.set(markerKey, id);
    if (legacy.length) await writeList(scoped(id), [...(await readList(scoped(id))), ...legacy]);
    await opts.store.remove(opts.legacyKey);
    return legacy;
  }

  return {
    async open() {
      const id = (await opts.accountId()) || null;
      await migrate(id);
      const set = new Set(id ? await readList(scoped(id)) : []);
      return {
        async seen(value) {
          return set.has(await digest(value));
        },
        async mark(values) {
          // Signed out ⇒ nothing could have been reported, so nothing to mark (and nothing to write
          // under a name the next account would inherit).
          if (!id || !values.length) return;
          for (const v of values) set.add(await digest(v));
          await writeList(scoped(id), [...set]);
        },
      };
    },
  };
}
