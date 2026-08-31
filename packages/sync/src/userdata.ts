/**
 * The synced USERDATA studio (pure): the user's Skills, Workflows and
 * Memory, as ALLOW-LISTED payloads on the record channel's reserved
 * {@link USERDATA_SCOPE}. This is REAL user content (reusable prompts, durable
 * personal facts), so it rides the SAME E2E envelope as conversations — the
 * server only ever stores ciphertext, and the extension (contributor) can
 * neither read nor write the scope (backend direction gate).
 *
 * Two halves, both diffed against a per-account LEDGER (`sigs` = what this
 * device last emitted OR absorbed per entity — the three-way BASE):
 *
 *  - {@link emitUserdataRecords} — one `userdata` record per new/changed entity,
 *    one `userdataTombstone` per locally-deleted one. Unchanged set → nothing.
 *  - {@link absorbUserdataRecords} — fold pulled records into the local
 *    snapshot. Per entity: remote-only news → apply; local-only news → keep
 *    (the next emit pushes it); BOTH changed → LOCAL wins (the user's
 *    uncommitted edit is never destroyed — it re-emits as the newest record).
 *    An edit-vs-delete conflict resurrects the edit, in either direction.
 *
 * Payloads are REBUILT field-by-field (never spread) so device-local extras —
 * usage counters, transient flags, anything a future field adds — can never
 * leak into a record. `uses` is deliberately NOT synced (a per-device ordering
 * hint, meaningless merged); local extras survive an absorb via spread-merge.
 */
import { liveView, mergeRecords, nextLamport } from "./records";
import type { SyncRecord } from "./types";
import {
  emptyUserdataSyncState,
  snapshotOfSettings,
  settingsPatchOf,
  type SyncedCompetence,
  type SyncedMemoryCard,
  type SyncedWorkflow,
  type UserdataPayload,
  type UserdataSnapshot,
  type UserdataSettingsLike,
  type UserdataSyncState,
} from "./userdataTypes";

// The allow-listed shapes + Settings glue live in `userdataTypes.ts` (300-LOC
// split); re-exported so `./userdata` stays the one import site for the feature.
export {
  emptyUserdataSyncState,
  snapshotOfSettings,
  settingsPatchOf,
  type SyncedCompetence,
  type SyncedMemoryCard,
  type SyncedWorkflow,
  type UserdataPayload,
  type UserdataSnapshot,
  type UserdataSettingsLike,
  type UserdataSyncState,
};

const str = (v: unknown): v is string => typeof v === "string";
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

const cleanCompetence = (c: SyncedCompetence): SyncedCompetence => ({
  id: c.id,
  name: c.name,
  prompt: c.prompt,
  cat: c.cat,
  createdAt: c.createdAt,
  ...(c.desc ? { desc: c.desc } : {}),
  ...(c.pinned ? { pinned: true } : {}),
});
const cleanWorkflow = (w: SyncedWorkflow): SyncedWorkflow => ({
  id: w.id,
  name: w.name,
  prompt: w.prompt,
  servers: (w.servers ?? []).filter(str),
  createdAt: w.createdAt,
  ...(str(w.cat) ? { cat: w.cat } : {}),
  ...(w.desc ? { desc: w.desc } : {}),
  ...(w.pinned ? { pinned: true } : {}),
});
const cleanMemoryCard = (m: SyncedMemoryCard): SyncedMemoryCard => ({
  id: m.id,
  entity: m.entity,
  cat: m.cat,
  facts: m.facts,
  createdAt: m.createdAt,
  updatedAt: m.updatedAt,
  ...(m.aliases?.length ? { aliases: m.aliases.filter(str) } : {}),
  ...(m.source === "auto" ? { source: "auto" as const } : {}),
});

const PROFILE_KEY = "profile";
const keyOf = (p: UserdataPayload): string =>
  p.type === "competence"
    ? `cmp:${p.item.id}`
    : p.type === "workflow"
      ? `wf:${p.item.id}`
      : p.type === "memoryCard"
        ? `mem:${p.item.id}`
        : PROFILE_KEY;

/** Deterministic signature: the clean* builders construct fields in a fixed
 *  order, so JSON.stringify is stable for identical content. */
const sigOf = (p: UserdataPayload): string => JSON.stringify(p);

/** The snapshot as (key → allow-listed payload) entries. */
function entriesOf(s: UserdataSnapshot): Map<string, UserdataPayload> {
  const out = new Map<string, UserdataPayload>();
  for (const c of s.competences) if (str(c.id)) out.set(`cmp:${c.id}`, { type: "competence", item: cleanCompetence(c) });
  for (const w of s.workflows) if (str(w.id)) out.set(`wf:${w.id}`, { type: "workflow", item: cleanWorkflow(w) });
  for (const m of s.memoryCards) if (str(m.id)) out.set(`mem:${m.id}`, { type: "memoryCard", item: cleanMemoryCard(m) });
  if (s.memoryProfile?.trim()) out.set(PROFILE_KEY, { type: "memoryProfile", profile: s.memoryProfile });
  return out;
}

/** Fail-closed payload validation: a record that doesn't match the allow-listed
 *  shape is SKIPPED, never merged (tampered/foreign payloads can't land). */
function validPayload(raw: unknown): UserdataPayload | null {
  const p = raw as UserdataPayload | null;
  if (!p || typeof p !== "object") return null;
  if (p.type === "memoryProfile") return str(p.profile) ? { type: "memoryProfile", profile: p.profile } : null;
  const item = (p as { item?: unknown }).item as Record<string, unknown> | undefined;
  if (!item || !str(item.id)) return null;
  if (p.type === "competence")
    return str(item.name) && str(item.prompt) && str(item.cat) && num(item.createdAt)
      ? { type: "competence", item: cleanCompetence(item as unknown as SyncedCompetence) }
      : null;
  if (p.type === "workflow")
    return str(item.name) && str(item.prompt) && num(item.createdAt)
      ? { type: "workflow", item: cleanWorkflow(item as unknown as SyncedWorkflow) }
      : null;
  if (p.type === "memoryCard")
    return str(item.entity) && str(item.facts) && str(item.cat) && num(item.createdAt) && num(item.updatedAt)
      ? { type: "memoryCard", item: cleanMemoryCard(item as unknown as SyncedMemoryCard) }
      : null;
  return null;
}

/** Records to push for the CURRENT local snapshot: a `userdata` per new/changed
 *  entity, a `userdataTombstone` per deleted one. Unchanged set emits nothing. */
export function emitUserdataRecords(
  current: UserdataSnapshot,
  state: UserdataSyncState,
  deviceId: string,
): { records: SyncRecord[]; state: UserdataSyncState } {
  let lamport = state.lamport;
  const records: SyncRecord[] = [];
  const sigs = { ...state.sigs };
  const entries = entriesOf(current);

  for (const [key, payload] of entries) {
    const sig = sigOf(payload);
    if (sigs[key] === sig) continue;
    lamport += 1;
    records.push({ recordId: `ud:${key}:${lamport}:${deviceId}`, entityId: key, kind: "userdata", lamport, deviceId, payload });
    sigs[key] = sig;
  }
  for (const key of Object.keys(sigs)) {
    if (entries.has(key)) continue;
    lamport += 1;
    records.push({ recordId: `uddel:${key}:${lamport}:${deviceId}`, entityId: key, kind: "userdataTombstone", lamport, deviceId, payload: {} });
    delete sigs[key];
  }

  if (!records.length) return { records, state };
  return { records, state: { ...state, lamport, sigs } };
}

/** Fold PULLED records into the local snapshot (three-way against the ledger —
 *  see the module doc for the per-entity rules). Extra local fields on an item
 *  survive via spread-merge; `changed` says whether the caller must re-persist. */
export function absorbUserdataRecords(
  local: UserdataSnapshot,
  pulled: SyncRecord[],
  state: UserdataSyncState,
): { snapshot: UserdataSnapshot; state: UserdataSyncState; changed: boolean } {
  const merged = mergeRecords([], pulled);
  const view = liveView(merged);
  const remote = new Map<string, UserdataPayload>();
  for (const r of view.userdata) {
    const p = validPayload(r.payload);
    if (p && keyOf(p) === r.entityId) remote.set(r.entityId, p);
  }
  const tombs = new Set(
    merged.filter((r) => r.kind === "userdataTombstone" && !remote.has(r.entityId)).map((r) => r.entityId),
  );

  const localEntries = entriesOf(local);
  const sigs = { ...state.sigs };
  let changed = false;

  // Working copies, keyed for in-place replace/add/delete.
  const comp = new Map(local.competences.map((c) => [`cmp:${c.id}`, c]));
  const wf = new Map(local.workflows.map((w) => [`wf:${w.id}`, w]));
  const mem = new Map(local.memoryCards.map((m) => [`mem:${m.id}`, m]));
  let profile = local.memoryProfile;

  const applyRemote = (key: string, p: UserdataPayload) => {
    if (p.type === "competence") comp.set(key, { ...comp.get(key), ...p.item });
    else if (p.type === "workflow") wf.set(key, { ...wf.get(key), ...p.item });
    else if (p.type === "memoryCard") mem.set(key, { ...mem.get(key), ...p.item });
    else profile = p.profile;
    sigs[key] = sigOf(p);
    changed = true;
  };
  const deleteLocal = (key: string) => {
    if (key === PROFILE_KEY) profile = undefined;
    else if (!comp.delete(key) && !wf.delete(key)) mem.delete(key);
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
      // New remote entity — or an edit NEWER than our locally-deleted base
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
    // Delete only what this device hasn't edited since base — an edited entity
    // survives and re-emits (edit beats delete, both directions).
    if (sigOf(localP) === state.sigs[key]) deleteLocal(key);
  }

  const snapshot: UserdataSnapshot = {
    competences: [...comp.values()],
    workflows: [...wf.values()],
    memoryCards: [...mem.values()],
    memoryProfile: profile,
  };
  const lamport = Math.max(state.lamport, nextLamport(pulled, state.lamport) - 1);
  return { snapshot, state: { ...state, lamport, sigs }, changed };
}
