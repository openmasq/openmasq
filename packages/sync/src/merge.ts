/**
 * Vault merge. A vault is append-mostly and near conflict-free: a given secret
 * always maps to the same placeholder/fake (the redaction engine's invariant), so
 * two devices that redact the same value produce the same pair. Merging is thus a
 * **union** of the maps — no CRDT needed. On the rare genuine key collision
 * (same placeholder, different value — shouldn't happen) we keep the entry from
 * the side with the newer `updatedAt`, i.e. last-write-wins per envelope.
 *
 * `redactionTimes` keeps the EARLIEST first-seen time across devices (a value's
 * first sighting is a fact, not a preference).
 */
import type { VaultPayload } from "./types";

export function mergeVaultPayloads(a: VaultPayload, b: VaultPayload): VaultPayload {
  const newer = a.updatedAt >= b.updatedAt ? a : b;
  const older = newer === a ? b : a;

  // Start from the older side, let the newer side win on any key collision.
  const redactionVault = { ...older.redactionVault, ...newer.redactionVault };
  const redactionKinds = { ...(older.redactionKinds ?? {}), ...(newer.redactionKinds ?? {}) };

  const redactionTimes: Record<string, number> = { ...(older.redactionTimes ?? {}) };
  for (const [value, t] of Object.entries(newer.redactionTimes ?? {})) {
    redactionTimes[value] = redactionTimes[value] === undefined ? t : Math.min(redactionTimes[value], t);
  }

  return {
    redactionVault,
    redactionKinds,
    redactionTimes,
    title: newer.title ?? older.title,
    modelId: newer.modelId ?? older.modelId,
    updatedAt: Math.max(a.updatedAt, b.updatedAt),
  };
}

/** True when `next` adds nothing `prev` doesn't already contain — lets a caller
 *  skip a redundant push (both maps are a superset check on keys). */
export function isVaultSubset(next: VaultPayload, prev: VaultPayload): boolean {
  const keys = Object.keys(next.redactionVault);
  if (keys.length > Object.keys(prev.redactionVault).length) return false;
  return keys.every((k) => prev.redactionVault[k] === next.redactionVault[k]);
}
