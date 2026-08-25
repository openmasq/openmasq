/**
 * The org-SHARE channel's client — propose / decide / read shares of the org
 * Coffre + compétences, E2E to each share's AUDIENCE (org / team / person —
 * see `orgCrypto.ts` for the model, `orgTypes.ts` for the approval shapes).
 * Same philosophy as `recordClient`: BEST-EFFORT everywhere (no passphrase /
 * signed out / network down / not admitted → no-op or empty, never a throw
 * that blocks the user), and the server only ever sees ciphertext + share
 * METADATA. The share matrix is enforced SERVER-side; the `can*` flags the
 * server returns are what the UI greys on — never a local re-derivation.
 *
 * Like `recordClient.dekFor`, a share whose envelopes this device CANNOT
 * DECRYPT is sealed for the session (`isCryptoFailure`); `resetKeys()` reopens
 * after a passphrase change. A NETWORK failure is never sealed.
 */
import { decryptRecord, encryptRecord } from "../crypto";
import type { PulledRecords } from "../recordClient";
import type { SyncRecord } from "../types";
import { mintOrgDek, openOrgDek, orgRecordConvId, rewrapMemberKey } from "./orgCrypto";
import { createShareKeyring } from "./orgShareKeys";
import type {
  OrgEncryptedRecord,
  OrgMemberPublicKey,
  OrgNotification,
  OrgScope,
  OrgScopeTransport,
  OrgShareInfo,
  ShareAudienceKind,
} from "./orgTypes";

export interface OrgScopeSyncOptions {
  transport: OrgScopeTransport;
  /** The E2E passphrase, or null → org sync is OFF (every call no-ops). */
  getPassphrase: () => Promise<string | null> | string | null;
  onError?: (scope: string, error: unknown) => void;
}

export interface ShareProposal {
  scope: OrgScope;
  audience: { kind: ShareAudienceKind; teamUuid?: string; targetUuid?: string };
  label: string;
}

export interface ShareMembershipResult {
  admitted: number;
  rotated: boolean;
}

export interface OrgScopeSync {
  /** Publish this account's member keypair if absent (first-writer-wins). */
  ensureMemberKey(): Promise<boolean>;
  /** The shares this caller may see (metadata + server-computed `can*`). */
  listShares(orgUuid: string): Promise<OrgShareInfo[]>;
  /** Propose a share AND seed it: mints its DEK (v1), wraps it to the whole
   *  audience (keyed members only), stores the envelopes, pushes the records.
   *  Returns the share, or null when anything prevented a COMPLETE seed. */
  proposeShare(orgUuid: string, proposal: ShareProposal, records: SyncRecord[]): Promise<OrgShareInfo | null>;
  /** Decrypt a share's records since the cursor (author, or approved audience). */
  pullShare(orgUuid: string, share: OrgShareInfo, since: number): Promise<PulledRecords>;
  /** Encrypt + append records under the share's CURRENT key version. */
  pushToShare(orgUuid: string, share: OrgShareInfo, records: SyncRecord[]): Promise<number>;
  /** Approve/refuse a pending share (the server checks WHO may). */
  decideShare(orgUuid: string, shareUuid: string, approve: boolean): Promise<OrgShareInfo | null>;
  /** Revoke a share (author or governance — server-checked). */
  revokeShare(orgUuid: string, shareUuid: string): Promise<boolean>;
  /** AUTHOR/admin drive of a share's recipient set: admit newly-keyed audience
   *  members at the current version, ROTATE when a holder left the audience. */
  syncShareMembership(orgUuid: string, share: OrgShareInfo): Promise<ShareMembershipResult>;
  /** My approval inbox / mark one read. */
  listNotifications(orgUuid: string): Promise<OrgNotification[]>;
  readNotification(orgUuid: string, id: number): Promise<void>;
  /** Passphrase change: re-wrap the member private key (same keypair). */
  rewrapMemberKey(oldPassphrase: string, newPassphrase: string): Promise<boolean>;
  /** Forget sealed shares + cached keys — call when the passphrase changes. */
  resetKeys(): void;
}

/** The members inside a share's audience (author ALWAYS included — they must
 *  hold their own DEK). Pure — pinned in `orgScope.test.ts`. */
export function audienceMembers(
  share: Pick<OrgShareInfo, "audience" | "authorUuid">,
  members: OrgMemberPublicKey[],
): OrgMemberPublicKey[] {
  const { kind, teamUuid, targetUuid } = share.audience;
  return members.filter(
    (m) =>
      m.memberUuid === share.authorUuid ||
      (kind === "org" ||
        (kind === "team" && !!teamUuid && m.teamUuid === teamUuid) ||
        (kind === "user" && m.memberUuid === targetUuid)),
  );
}

export function createOrgScopeSync(opts: OrgScopeSyncOptions): OrgScopeSync {
  const { transport } = opts;
  const report = (scope: string, e: unknown) => opts.onError?.(scope, e);

  const keyring = createShareKeyring({ transport, getPassphrase: opts.getPassphrase, report });

  async function pushToShare(
    orgUuid: string,
    share: OrgShareInfo,
    records: SyncRecord[],
    retried = false,
  ): Promise<number> {
    if (!records.length) return 0;
    const deks = await keyring.deksFor(orgUuid, share);
    if (!deks?.size) return 0;
    const version = Math.max(...deks.keys());
    const dek = deks.get(version)!;
    const convId = orgRecordConvId(orgUuid, share.scope, share.shareUuid);
    try {
      const wire: OrgEncryptedRecord[] = [];
      for (const r of records) {
        const blob = await encryptRecord(dek, convId, r.recordId, r);
        wire.push({ recordId: r.recordId, keyVersion: version, ...blob });
      }
      await transport.putShareRecords(orgUuid, share.shareUuid, wire);
      return wire.length;
    } catch (e) {
      // 409 = a rotation landed elsewhere: refresh the envelopes, retry once.
      if ((e as { status?: number }).status === 409 && !retried) {
        keyring.invalidate(share.shareUuid);
        return pushToShare(orgUuid, share, records, true);
      }
      report(`sharePush(${convId})`, e);
      return 0;
    }
  }

  return {
    async ensureMemberKey() {
      return (await keyring.memberPrivate()) !== null;
    },

    async listShares(orgUuid) {
      try {
        return await transport.listShares(orgUuid);
      } catch (e) {
        report("listShares", e);
        return [];
      }
    },

    async proposeShare(orgUuid, proposal, records) {
      const priv = await keyring.memberPrivate();
      if (!priv) return null;
      try {
        const share = await transport.proposeShare(orgUuid, { ...proposal, itemCount: records.length });
        if (!share) return null;
        const members = await transport.listOrgMemberKeys(orgUuid);
        const raw = mintOrgDek();
        await keyring.wrapRound(orgUuid, share, 1, raw, audienceMembers(share, members));
        raw.fill(0);
        keyring.invalidate(share.shareUuid);
        if (records.length) await pushToShare(orgUuid, share, records);
        return share;
      } catch (e) {
        report("proposeShare", e);
        return null;
      }
    },

    async pullShare(orgUuid, share, since) {
      const empty = { records: [], seq: since };
      const deks = await keyring.deksFor(orgUuid, share);
      if (!deks?.size) return empty;
      const convId = orgRecordConvId(orgUuid, share.scope, share.shareUuid);
      try {
        const { records, seq } = await transport.getShareRecords(orgUuid, share.shareUuid, since);
        const out: SyncRecord[] = [];
        for (const r of records) {
          const dek = deks.get(r.keyVersion);
          if (!dek) {
            report(`decrypt(${convId}/${r.recordId})`, new Error(`no DEK v${r.keyVersion}`));
            continue;
          }
          try {
            out.push((await decryptRecord(dek, convId, r.recordId, r)) as SyncRecord);
          } catch (e) {
            report(`decrypt(${convId}/${r.recordId})`, e); // skip, never merge unverified
          }
        }
        return { records: out, seq };
      } catch (e) {
        report(`sharePull(${convId})`, e);
        return empty;
      }
    },

    pushToShare,

    async decideShare(orgUuid, shareUuid, approve) {
      try {
        return await transport.decideShare(orgUuid, shareUuid, approve);
      } catch (e) {
        report(`decideShare(${shareUuid})`, e);
        return null;
      }
    },

    async revokeShare(orgUuid, shareUuid) {
      try {
        await transport.revokeShare(orgUuid, shareUuid);
        return true;
      } catch (e) {
        report(`revokeShare(${shareUuid})`, e);
        return false;
      }
    },

    async syncShareMembership(orgUuid, share) {
      const none = { admitted: 0, rotated: false };
      const priv = await keyring.memberPrivate();
      if (!priv || !share.canWrite) return none;
      try {
        const members = await transport.listOrgMemberKeys(orgUuid);
        const audience = audienceMembers(share, members);
        const keys = await transport.getShareKeys(orgUuid, share.shareUuid);
        if (keys.currentVersion === 0) return none; // never seeded — proposeShare's job
        const mine = keys.envelopes.find((e) => e.keyVersion === keys.currentVersion);
        if (!mine) return none; // current DEK not wrapped to me — another writer drives
        const { raw } = await openOrgDek(mine, priv, orgUuid, share.scope, share.shareUuid);

        const inAudience = new Set(audience.map((m) => m.memberUuid));
        if (keys.holders.some((uuid) => !inAudience.has(uuid))) {
          // Someone holding the DEK left the audience (org leaver, team move,
          // person share gone stale) → ROTATE to the remaining members.
          const admitted = await keyring.wrapRound(orgUuid, share, keys.currentVersion + 1, raw, audience);
          raw.fill(0);
          keyring.invalidate(share.shareUuid);
          return { admitted, rotated: true };
        }
        const holders = new Set(keys.holders);
        const missing = audience.filter((m) => m.publicJwk && !holders.has(m.memberUuid));
        const admitted = missing.length
          ? await keyring.wrapRound(orgUuid, share, keys.currentVersion, raw, missing)
          : 0;
        raw.fill(0);
        return { admitted, rotated: false };
      } catch (e) {
        report(`syncShareMembership(${share.shareUuid})`, e);
        return none;
      }
    },

    async listNotifications(orgUuid) {
      try {
        return await transport.listNotifications(orgUuid);
      } catch (e) {
        report("listNotifications", e);
        return [];
      }
    },

    async readNotification(orgUuid, id) {
      try {
        await transport.readNotification(orgUuid, id);
      } catch (e) {
        report(`readNotification(${id})`, e);
      }
    },

    async rewrapMemberKey(oldPassphrase, newPassphrase) {
      try {
        const envelope = await transport.getMyMemberKey();
        if (!envelope) return false;
        const next = await rewrapMemberKey(envelope, oldPassphrase, newPassphrase);
        await transport.putMemberKey(next, true);
        return true;
      } catch (e) {
        report("rewrapMemberKey", e); // skipped, old envelope intact
        return false;
      }
    },

    resetKeys() {
      keyring.reset();
    },
  };
}
