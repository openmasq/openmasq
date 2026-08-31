/**
 * The E2E PASSPHRASE stored PER ACCOUNT, on any key→value store.
 *
 * ══ WHY THIS MODULE EXISTS ══════════════════════════════════════════════════
 *
 * The passphrase used to be stored under ONE key per device across the three surfaces.
 * Nothing cleared it on account switch, so the next account ended up synced
 * **with the previous one's key**: it had asked for nothing, and worse it does NOT HOLD
 * the key that encrypts its own vaults — someone else chose it and knows it.
 * The E2E promise (« no one but you ») was false for it.
 *
 * The policy comes down to two rules, and both are subtle:
 *
 *  1. **We STORE per account, we never CLEAR on switch.** There is no
 *     escrow: a lost passphrase orphans that account's already-synced
 *     vaults for good. Coming back to the first account must recover its own
 *     without retyping it — it's the storage that isolates, not destruction.
 *  2. **The old account-less value goes to the FIRST connected account**, once
 *     only, then a marker closes the door for everyone else and the inherited key is
 *     removed. It's its owner in the vast majority of cases, and it's the only one
 *     who would lose anything; the next ones start without a passphrase, hence without sync,
 *     which is exactly the correct state for them.
 *
 * It lives HERE because mobile and the extension apply the SAME policy on two
 * different stores (`@capacitor/preferences`, `chrome.storage.local`): two copies of these
 * two rules would have diverged, and that's the kind of gap that only shows up after the
 * fact. The desktop doesn't use it — its own family is the encrypted secrets of the main
 * process (`accountSecretFile`, modeled on `keys.ts`), and aligning it with this one
 * would have pulled it out of the only one whose risks it shares.
 */

/** The strict minimum a store must offer. `get` may return `undefined`: both
 *  implementations do, and forcing it to `null` would mean an adapter in each. */
export interface PassphraseStore {
  get(key: string): Promise<string | null | undefined>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface AccountPassphraseOptions {
  store: PassphraseStore;
  /** The old key, account-less — the one we adopt once then remove. */
  legacyKey: string;
  /** The account's key. Default: `<legacyKey>:<sub>`. */
  scopedKey?: (accountId: string) => string;
  /** The adoption marker. Default: `<legacyKey>:adopted`. */
  markerKey?: string;
  /** The connected account (`sub`), or `null`. */
  accountId: () => Promise<string | null | undefined>;
}

export interface AccountPassphrase {
  /** This account's passphrase. `null` signed out — so sync off, which is correct. */
  get(): Promise<string | null>;
  /** Set the passphrase. **Throws** without an account: a « it's saved » that saved
   *  nothing is the bug we're fixing, not a case to swallow. */
  set(passphrase: string): Promise<void>;
  /** Turn off sync for THIS account. Other accounts keep theirs. */
  clear(): Promise<void>;
}

export function accountPassphrase(opts: AccountPassphraseOptions): AccountPassphrase {
  const scoped = opts.scopedKey ?? ((id: string) => `${opts.legacyKey}:${id}`);
  const marker = opts.markerKey ?? `${opts.legacyKey}:adopted`;

  /**
   * The one-time adoption. ⚠️ It CANNOT run without an account: without that the first
   * signed-out launch would remove the inherited key and the passphrase would be lost for
   * everyone. And the inherited key is only removed AFTER the account's slot is
   * successfully written — the order is the fix, the reverse loses the passphrase if the write fails.
   */
  async function adoptLegacy(accountId: string): Promise<string | null> {
    if (await opts.store.get(marker)) return null; // already claimed by an account
    const legacy = await opts.store.get(opts.legacyKey);
    if (!legacy) {
      await opts.store.set(marker, accountId); // nothing to adopt — closing the door
      return null;
    }
    await opts.store.set(scoped(accountId), legacy);
    await opts.store.set(marker, accountId);
    await opts.store.remove(opts.legacyKey);
    return legacy;
  }

  return {
    async get() {
      const id = await opts.accountId();
      if (!id) return null;
      const mine = await opts.store.get(scoped(id));
      if (mine) return mine;
      return (await adoptLegacy(id)) ?? null;
    },
    async set(passphrase) {
      const id = await opts.accountId();
      if (!id) throw new Error("no account — refusing to store the sync passphrase");
      await opts.store.set(scoped(id), passphrase);
      // The account now has ITS OWN passphrase: the inherited one no longer has reason to be adopted by it,
      // and leaving it in place would hand it to the next account.
      await opts.store.set(marker, id);
      await opts.store.remove(opts.legacyKey);
    },
    async clear() {
      const id = await opts.accountId();
      if (!id) return; // nothing to turn off for anyone
      await opts.store.remove(scoped(id));
      // We also close the adoption door: without that, turning off sync then
      // reloading would re-adopt the old passphrase — reactivation, identically.
      await opts.store.set(marker, id);
      await opts.store.remove(opts.legacyKey);
    },
  };
}
