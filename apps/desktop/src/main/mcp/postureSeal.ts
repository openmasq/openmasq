import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Authenticates the PLAIN files that decide a security posture: the confirmation mode
 * (`confirmationMode.ts`) and a connector's `url` and granted folders (`persist.ts`).
 *
 * They are plain on purpose (not secrets), but they were also unauthenticated: whoever can
 * write the data folder, without the keychain, could flip `renforce` to `standard`, point a
 * connected server at another host or widen the folders a file tool reaches, and the app
 * read it back as the user's own choice. So each value carries a tag made with a key the
 * KEYCHAIN holds (`postureKey.ts`), and a value whose tag is missing or wrong is not the
 * user's: the caller reads the STRICTEST answer instead.
 *
 * One adoption per store, for an install that predates the tag: a store this install never
 * sealed is taken as it stands and sealed; the fact is recorded INSIDE the sealed key file,
 * so removing a tag from the plain file does not make it look new again.
 *
 * ⚠️ RESIDUALS, said plainly. (1) Erasing the key file with the stores resets them to the
 * product default, like a reinstall: nothing local can tell the two apart. (2) Where the
 * keychain cannot seal (`store/atRestPolicy.ts`), the key sits in its documented cleartext
 * fallback and the tag authenticates nothing. (3) A value copied back from an older genuine
 * file of the same install verifies. Pinned by `postureSeal.test.ts`.
 */
export interface PostureKeyStore {
  /** The sealed text as stored, or null when absent OR unreadable right now. */
  read(): string | null;
  write(text: string): void;
  /** Is the key file there at all (readable or not)? */
  exists(): boolean;
}

interface Sealed {
  key: string;
  adopted: string[];
}

let store: PostureKeyStore | null = null;
let cached: Sealed | null = null;

/** Wired once at app start (`index.ts`). Without it (unit tests of the callers) sealing is
 *  OFF and `verdict` answers `"off"`: the callers keep their plain behaviour. */
export function initPostureSeal(s: PostureKeyStore | null): void {
  store = s;
  cached = null;
}

function parse(text: string | null): Sealed | null {
  if (!text) return null;
  try {
    const p = JSON.parse(text) as Partial<Sealed>;
    if (typeof p.key === "string" && /^[0-9a-f]{64}$/.test(p.key) && Array.isArray(p.adopted)) {
      return { key: p.key, adopted: p.adopted.filter((a): a is string => typeof a === "string") };
    }
  } catch {
    /* not ours */
  }
  return null;
}

/** The key, made the first time. null: the file is there but cannot be read now (a locked
 *  keychain, a damaged file) — nothing can be verified, the callers go strict. */
function sealed(): Sealed | null {
  if (!store) return null;
  if (cached) return cached;
  const had = store.exists();
  cached = parse(store.read());
  if (!cached && !had) {
    cached = { key: randomBytes(32).toString("hex"), adopted: [] };
    store.write(JSON.stringify(cached));
    // a key that did not reach the disk seals nothing a restart could verify
    if (!parse(store.read())) cached = null;
  }
  return cached;
}

/** Sorted keys at every depth: the same value always makes the same bytes. */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(v ?? null);
}

/** The tag of `value` under `kind` (the kind binds a tag to ITS store and entry), or null
 *  when sealing is off or the key is out of reach. */
export function postureTag(kind: string, value: unknown): string | null {
  const s = sealed();
  return s ? createHmac("sha256", Buffer.from(s.key, "hex")).update(`${kind}\0${canonical(value)}`).digest("hex") : null;
}

/**
 * - `"off"`: sealing not wired (tests) — the caller behaves as before.
 * - `"ok"`: the tag is this install's.
 * - `"adopt"`: `store` was never sealed by this install — take the value, then `markAdopted`.
 * - `"bad"`: missing or wrong tag on a store already sealed, or a key out of reach (a locked
 *   keychain reads the same: what cannot be verified is not used).
 */
export function postureVerdict(storeName: string, kind: string, value: unknown, tag: unknown): "off" | "ok" | "adopt" | "bad" {
  if (!store) return "off";
  const s = sealed();
  if (!s) return "bad";
  if (!s.adopted.includes(storeName)) return "adopt";
  const want = postureTag(kind, value);
  if (!want || typeof tag !== "string" || tag.length !== want.length) return "bad";
  return timingSafeEqual(Buffer.from(tag), Buffer.from(want)) ? "ok" : "bad";
}

/** Has this install sealed `storeName` already? (A missing file of a sealed store is not a
 *  fresh default.) False when sealing is off. */
export function postureAdopted(storeName: string): boolean {
  return !!store && !!sealed()?.adopted.includes(storeName);
}

/** Record, in the sealed key file, that `storeName` is sealed from now on. */
export function markAdopted(storeName: string): void {
  const s = sealed();
  if (!store || !s || s.adopted.includes(storeName)) return;
  s.adopted.push(storeName);
  store.write(JSON.stringify(s));
}
