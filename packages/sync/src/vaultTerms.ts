/**
 * The synced COFFRE (pure): the user's dictionary of values ALWAYS redacted,
 * as ALLOW-LISTED payloads on the record channel's reserved {@link COFFRE_SCOPE}.
 * The terms are REAL PII (the very values the user never wants to leak), so they
 * ride the SAME E2E envelope as conversations — the server only ever stores
 * ciphertext.
 *
 * ⚠️ Unlike `@userdata`, this scope is BIDIRECTIONAL for the extension too: the
 * backend's direction gate special-cases exactly this conv id so the
 * `contributor` device can pull the terms it must enforce before a ChatGPT send
 * (see `types.ts` {@link COFFRE_SCOPE} for the accepted residual).
 *
 * Same three-way machinery as `userdata.ts`, against a per-account LEDGER
 * (`sigs` = what this device last emitted OR absorbed per term):
 *
 *  - {@link emitVaultTermRecords} — one `coffre` record per new/changed term, one
 *    `coffreTombstone` per locally-deleted one. Unchanged set → nothing.
 *  - {@link absorbVaultTermRecords} — fold pulled records into the local list.
 *    Remote-only news → apply; local-only news → keep (re-emits); BOTH changed
 *    → LOCAL wins; edit-vs-delete resurrects the edit, in either direction.
 *
 * Payloads are REBUILT field-by-field (never spread) so device-local extras can
 * never leak into a record; extra local fields survive an absorb via
 * spread-merge (each app's richer CoffreTerm satisfies the shape structurally).
 */
import { liveView, mergeRecords, nextLamport } from "./records";
import type { SyncRecord } from "./types";

/** One Coffre term, as the sync sees it (allow-listed). `value` is the REAL
 *  value to always redact; `token` its canonical redaction category token
 *  (NAME/ORG/IBAN/…) so every surface fakes it same-kind. */
export interface SyncedVaultTerm {
  id: string;
  value: string;
  token: string;
  note?: string;
  createdAt: number;
}

/** Per-account ledger (persisted by the app; term ids + signatures only —
 *  nothing beyond what the encrypted records already carry). */
export interface VaultTermsSyncState {
  accountId: string;
  lamport: number;
  /** Term key (`cf:<id>`) → signature of what was last emitted/absorbed. */
  sigs: Record<string, string>;
}

export const emptyVaultTermsSyncState = (accountId: string): VaultTermsSyncState => ({
  accountId,
  lamport: 0,
  sigs: {},
});

const str = (v: unknown): v is string => typeof v === "string";
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Rebuild the allow-listed subset, field by field (never spread). */
const cleanTerm = (t: SyncedVaultTerm): SyncedVaultTerm => ({
  id: t.id,
  value: t.value,
  token: t.token,
  createdAt: t.createdAt,
  ...(t.note ? { note: t.note } : {}),
});

type VaultTermPayload = { type: "coffreTerm"; item: SyncedVaultTerm };

const keyOf = (id: string): string => `cf:${id}`;
/** Deterministic signature: cleanTerm builds fields in a fixed order, so
 *  JSON.stringify is stable for identical content. */
const sigOf = (p: VaultTermPayload): string => JSON.stringify(p);

function entriesOf(terms: SyncedVaultTerm[]): Map<string, VaultTermPayload> {
  const out = new Map<string, VaultTermPayload>();
  for (const t of terms)
    if (str(t.id) && str(t.value)) out.set(keyOf(t.id), { type: "coffreTerm", item: cleanTerm(t) });
  return out;
}

/** Fail-closed payload validation: a record that doesn't match the allow-listed
 *  shape is SKIPPED, never merged (tampered/foreign payloads can't land). */
function validPayload(raw: unknown): VaultTermPayload | null {
  const p = raw as VaultTermPayload | null;
  if (!p || typeof p !== "object" || p.type !== "coffreTerm") return null;
  const item = (p as { item?: unknown }).item as Record<string, unknown> | undefined;
  if (!item || !str(item.id) || !str(item.value) || !str(item.token) || !num(item.createdAt))
    return null;
  return { type: "coffreTerm", item: cleanTerm(item as unknown as SyncedVaultTerm) };
}

/** Records to push for the CURRENT local list: a `coffre` per new/changed term,
 *  a `coffreTombstone` per deleted one. Unchanged set emits nothing. */
export function emitVaultTermRecords(
  current: SyncedVaultTerm[],
  state: VaultTermsSyncState,
  deviceId: string,
): { records: SyncRecord[]; state: VaultTermsSyncState } {
  let lamport = state.lamport;
  const records: SyncRecord[] = [];
  const sigs = { ...state.sigs };
  const entries = entriesOf(current);

  for (const [key, payload] of entries) {
    const sig = sigOf(payload);
    if (sigs[key] === sig) continue;
    lamport += 1;
    records.push({ recordId: `cf:${key}:${lamport}:${deviceId}`, entityId: key, kind: "coffre", lamport, deviceId, payload });
    sigs[key] = sig;
  }
  for (const key of Object.keys(sigs)) {
    if (entries.has(key)) continue;
    lamport += 1;
    records.push({ recordId: `cfdel:${key}:${lamport}:${deviceId}`, entityId: key, kind: "coffreTombstone", lamport, deviceId, payload: {} });
    delete sigs[key];
  }

  if (!records.length) return { records, state };
  return { records, state: { ...state, lamport, sigs } };
}

/** Fold PULLED records into the local list (three-way against the ledger — see
 *  the module doc). `changed` says whether the caller must re-persist. */
export function absorbVaultTermRecords(
  local: SyncedVaultTerm[],
  pulled: SyncRecord[],
  state: VaultTermsSyncState,
): { terms: SyncedVaultTerm[]; state: VaultTermsSyncState; changed: boolean } {
  const merged = mergeRecords([], pulled);
  const view = liveView(merged);
  const remote = new Map<string, VaultTermPayload>();
  for (const r of view.coffre) {
    const p = validPayload(r.payload);
    if (p && keyOf(p.item.id) === r.entityId) remote.set(r.entityId, p);
  }
  const tombs = new Set(
    merged.filter((r) => r.kind === "coffreTombstone" && !remote.has(r.entityId)).map((r) => r.entityId),
  );

  const localEntries = entriesOf(local);
  const sigs = { ...state.sigs };
  let changed = false;
  const working = new Map(local.map((t) => [keyOf(t.id), t]));

  const applyRemote = (key: string, p: VaultTermPayload) => {
    // Spread-merge so a device-local extra field on the term survives the absorb.
    working.set(key, { ...working.get(key), ...p.item });
    sigs[key] = sigOf(p);
    changed = true;
  };
  const deleteLocal = (key: string) => {
    working.delete(key);
    delete sigs[key];
    changed = true;
  };

  for (const [key, p] of remote) {
    const remoteSig = sigOf(p);
    const localP = localEntries.get(key);
    const localSig = localP ? sigOf(localP) : null;
    const base = state.sigs[key];
    if (localSig === remoteSig) {
      if (sigs[key] !== remoteSig) sigs[key] = remoteSig; // converged → align ledger
    } else if (localP) {
      // Local unchanged since base → remote wins; else local wins (re-emits).
      if (localSig === base) applyRemote(key, p);
    } else if (base === undefined || remoteSig !== base) {
      // New remote term — or an edit NEWER than our locally-deleted base
      // (edit-vs-delete → the edit resurrects).
      applyRemote(key, p);
    }
    // else: locally deleted, remote unchanged → stays deleted; emit tombstones.
  }
  for (const key of tombs) {
    const localP = localEntries.get(key);
    if (!localP) {
      if (state.sigs[key] !== undefined) deleteLocal(key); // align ledger
      continue;
    }
    // Delete only what this device hasn't edited since base — an edited term
    // survives and re-emits (edit beats delete, both directions).
    if (sigOf(localP) === state.sigs[key]) deleteLocal(key);
  }

  const lamport = Math.max(state.lamport, nextLamport(pulled, state.lamport) - 1);
  return { terms: [...working.values()], state: { ...state, lamport, sigs }, changed };
}
