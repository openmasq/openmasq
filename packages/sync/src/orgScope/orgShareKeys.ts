/**
 * The org-share KEYRING — the key plumbing `orgClient.ts` composes (300-LOC
 * split, rule 1): this account's member private key (published first-writer-
 * wins, opened under the passphrase), the per-share DEK cache, and the wrap
 * round that envelopes a raw DEK to a list of keyed members. Sealing mirrors
 * `recordClient.dekFor`: a crypto failure is terminal for the session (neither
 * the envelope nor the passphrase changes by itself); `reset()` reopens after
 * a passphrase change. A NETWORK failure is never sealed.
 */
import { isCryptoFailure } from "../recordClient";
import { createMemberKey, openMemberKey, openOrgDek, wrapOrgDek } from "./orgCrypto";
import type { OrgKeyEnvelope, OrgMemberPublicKey, OrgScopeTransport, OrgShareInfo } from "./orgTypes";

export interface ShareKeyringOptions {
  transport: OrgScopeTransport;
  getPassphrase: () => Promise<string | null> | string | null;
  report: (scope: string, error: unknown) => void;
}

export interface ShareKeyring {
  /** This account's live private key (publishing the keypair on first use). */
  memberPrivate(): Promise<CryptoKey | null>;
  /** My openable DEKs for a share, by version (cached per share). */
  deksFor(orgUuid: string, share: OrgShareInfo): Promise<Map<number, CryptoKey> | null>;
  /** Wrap a raw DEK to every KEYED member given + store the envelopes. */
  wrapRound(
    orgUuid: string,
    share: OrgShareInfo,
    version: number,
    raw: Uint8Array,
    members: OrgMemberPublicKey[],
  ): Promise<number>;
  /** Drop one share's cached DEKs (after a rotation / 409). */
  invalidate(shareUuid: string): void;
  /** Forget everything sealed + cached (passphrase change). */
  reset(): void;
}

export function createShareKeyring(opts: ShareKeyringOptions): ShareKeyring {
  const { transport, report } = opts;
  let privateKey: CryptoKey | null = null;
  const sealed = new Set<string>();
  const dekCache = new Map<string, Map<number, CryptoKey>>();

  async function memberPrivate(): Promise<CryptoKey | null> {
    if (privateKey) return privateKey;
    if (sealed.has("memberKey")) return null;
    const pass = await opts.getPassphrase();
    if (!pass) return null;
    try {
      let envelope = await transport.getMyMemberKey();
      if (!envelope) {
        const minted = await createMemberKey(pass);
        envelope = await transport.putMemberKey(minted.envelope);
        // First writer wins: if the server kept OURS, use the minted key.
        if (envelope.wrappedPrivate === minted.envelope.wrappedPrivate) {
          privateKey = minted.privateKey;
          return privateKey;
        }
      }
      privateKey = await openMemberKey(envelope, pass);
      return privateKey;
    } catch (e) {
      if (isCryptoFailure(e)) sealed.add("memberKey");
      report("memberKey", e);
      return null;
    }
  }

  return {
    memberPrivate,

    async deksFor(orgUuid, share) {
      const key = share.shareUuid;
      if (sealed.has(key)) return null;
      const cached = dekCache.get(key);
      if (cached?.size) return cached;
      const priv = await memberPrivate();
      if (!priv) return null;
      try {
        const { envelopes } = await transport.getShareKeys(orgUuid, key);
        const out = new Map<number, CryptoKey>();
        let cryptoFailed = false;
        for (const env of envelopes) {
          try {
            out.set(env.keyVersion, (await openOrgDek(env, priv, orgUuid, share.scope, key)).dek);
          } catch (e) {
            if (isCryptoFailure(e)) cryptoFailed = true;
            report(`openOrgDek(${key}:v${env.keyVersion})`, e);
          }
        }
        if (!out.size && envelopes.length && cryptoFailed) sealed.add(key);
        dekCache.set(key, out);
        return out;
      } catch (e) {
        report(`shareKeys(${key})`, e);
        return null;
      }
    },

    async wrapRound(orgUuid, share, version, raw, members) {
      const envelopes: { memberUuid: string; envelope: OrgKeyEnvelope }[] = [];
      for (const m of members) {
        if (!m.publicJwk) continue; // not keyed yet — admitted on a later pass
        envelopes.push({
          memberUuid: m.memberUuid,
          envelope: await wrapOrgDek(raw, m.publicJwk, orgUuid, share.scope, share.shareUuid, version),
        });
      }
      if (envelopes.length) await transport.putShareKeys(orgUuid, share.shareUuid, version, envelopes);
      return envelopes.length;
    },

    invalidate(shareUuid) {
      dekCache.delete(shareUuid);
    },

    reset() {
      sealed.clear();
      dekCache.clear();
      privateKey = null;
    },
  };
}
