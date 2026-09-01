/**
 * The DB mirror translates "a known conversation absent from the state" into DELETE.
 * That's fine for ONE deletion; it's a disaster when the whole state was just WIPED
 * (spurious disconnect, account adoption, state not hydrated yet): on 13/08, this
 * sweep translated an in-memory wipe into the deletion of ALL of an account's
 * conversations — messages, vault and files included — in the only database that held them.
 *
 * The rule: a state at ZERO conversations facing SEVERAL known ones is not a series of
 * deletions, it's a wipe — don't sweep. The most common legitimate case stays
 * covered: deleting your only conversation (1 known → 0) sweeps normally. A real
 * mass deletion (rare) re-syncs on the next load at worst; the reverse — destroyed
 * data — cannot be repaired.
 */
export function shouldSweepDeletions(stateSize: number, knownSize: number): boolean {
  return !(stateSize === 0 && knownSize > 1);
}

/**
 * The gate for SYNC channels (`useSyncChannel.ready`): "ready" means "the state
 * actually reflects the account", not "the load attempt is finished".
 *
 * `store.loaded` becomes true EVEN when `db.load()` has failed (the UI must live on
 * the localStorage mirror) — but a sync that starts there pulls and pushes against a
 * partial store: the pull manufactures SKELETON conversations (title with no messages —
 * the 14/08 incident: 47 conversations emptied), the push manufactures TOMBSTONES ("they
 * deleted everything"). Fail closed: DB present but not hydrated ⇒ no sync this session.
 * Without a DB (browser preview, mobile), the localStorage state IS the hydration.
 */
export function isSyncReady(loaded: boolean, hasDb: boolean, dbHydrated: boolean): boolean {
  return loaded && (!hasDb || dbHydrated);
}

/** The mirror sweep, guard included: deletes from the database the conversations that
 *  the ledger knows and the state no longer has — except when the gap has the signature
 *  of a WIPE (see above), in which case nothing is deleted and the refusal is logged. */
export function sweepDeletions(
  known: ReadonlyMap<string, unknown>,
  current: ReadonlyMap<string, unknown>,
  del: (id: string) => void,
): void {
  if (!shouldSweepDeletions(current.size, known.size)) {
    console.error(`[db] balayage REFUSÉ : état vide face à ${known.size} conversations connues — vidage probable, rien n'est supprimé`);
    return;
  }
  for (const id of known.keys()) if (!current.has(id)) del(id);
}
