/**
 * Fleet migration — the 24/08/2026 rename.
 *
 * The monorepo's code name changed, and with it the localStorage key prefix
 * (`<old>.…` → `openmasq.…`, per-account `:<uid>` variants included). An install
 * from before the migration therefore starts with its settings, theme, tabs… under
 * the OLD prefix: without this copy, the app would restart empty right in front of it.
 *
 * COPY, never a move: the old key stays in place so a build rollback finds its state
 * again. And the target is NEVER overwritten — a key already written by the new
 * build takes precedence over the old one.
 *
 * ⚠️ This file is THE home of the retired prefix (named exception of `check:brand`,
 * along with `index.html`'s theme script and the legacy DB adoption) — don't write
 * it anywhere else.
 *
 * ⚠️ There is only ONE old prefix, and that's intentional: the name carried between
 * this one and `openmasq` was never shipped, so no install holds keys under that
 * name and there's nothing to pick up there. A clean break, not an oversight.
 */

/** Exported for tests — never for a reader: read the CURRENT key. */
export const LEGACY_STORAGE_PREFIX = "openmasq.";
const PREFIX = "openmasq.";

let done = false;

/** Test-only: re-arms the pass (the module flag survives across tests). */
export function resetLegacyStorageMigrationForTests(): void {
  done = false;
}

/**
 * Copies each `<old>.<suffix>` key to an absent `openmasq.<suffix>`. Idempotent
 * (one pass per session), safe without `localStorage` (SSR, worker, node test). Called
 * at the top of the FIRST readers (`theme`, `storePersistence.load`, `reduxBoot`…) —
 * so every later reader sees already-migrated keys.
 */
export function migrateLegacyLocalStorage(): void {
  if (done) return;
  done = true;
  try {
    const legacyKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(LEGACY_STORAGE_PREFIX)) legacyKeys.push(k);
    }
    for (const k of legacyKeys) {
      const target = PREFIX + k.slice(LEGACY_STORAGE_PREFIX.length);
      if (localStorage.getItem(target) !== null) continue;
      const v = localStorage.getItem(k);
      if (v !== null) localStorage.setItem(target, v);
    }
  } catch {
    // No localStorage here (SSR / node test) — nothing to migrate, and above all nothing to break.
  }
}
