/**
 * ORG-SHARE sync shapes — the E2E channel SHARED inside an organization, as
 * SHARES: a share targets the whole org, ONE team or ONE person, and must be
 * APPROVED before its audience reads it (org/team → an owner/admin decides;
 * person → the target consents). Metadata (audience, label, status) travels
 * in clear — it is what an approver decides on, since E2E means they may not
 * be able to READ what they approve. Content is ciphertext under a per-SHARE
 * DEK enveloped per audience member (`orgCrypto.ts`).
 */
import type { EncryptedRecord } from "../recordTypes";

/** The two org scopes, an ALLOW-list (backend parity pinned by its gate test).
 *  `coffre` = always-redacted terms; `userdata` = compétences. */
export const ORG_COFFRE_SCOPE = "coffre";
export const ORG_USERDATA_SCOPE = "userdata";
export const ORG_SCOPES = [ORG_COFFRE_SCOPE, ORG_USERDATA_SCOPE] as const;
export type OrgScope = (typeof ORG_SCOPES)[number];

/** The three audiences a share can target — same parity contract. */
export const SHARE_AUDIENCES = ["org", "team", "user"] as const;
export type ShareAudienceKind = (typeof SHARE_AUDIENCES)[number];
export type ShareStatus = "pending" | "approved" | "refused" | "revoked";

export interface ShareAudience {
  kind: ShareAudienceKind;
  teamUuid?: string;
  teamName?: string | null;
  targetUuid?: string;
}

/** A share as the backend lists it — metadata + THIS caller's capabilities
 *  (the UI never re-derives the matrix; the server is the authority). */
export interface OrgShareInfo {
  shareUuid: string;
  scope: OrgScope;
  audience: ShareAudience;
  label: string;
  itemCount: number;
  status: ShareStatus;
  authorUuid: string;
  authorName?: string | null;
  createdAt?: string;
  decidedAt?: string | null;
  mine: boolean;
  inAudience: boolean;
  canDecide: boolean;
  canWrite: boolean;
  canRead: boolean;
}

/** One approval-inbox row. Payload is METADATA only, never content. */
export interface OrgNotification {
  id: number;
  kind: "share_pending" | "share_decided" | string;
  payload: { label?: string; scope?: string; audience?: string; approved?: boolean; itemCount?: number };
  shareUuid: string;
  readAt: string | null;
  createdAt: string;
}

/** A member's sync keypair, as the server stores it (private half =
 *  passphrase-KEK ciphertext; public half plaintext by design). */
export interface MemberKeyEnvelope {
  publicJwk: string;
  kekSalt: string;
  privIv: string;
  wrappedPrivate: string;
  v: 1;
}

/** One ACTIVE member as listed to whoever wraps a DEK — the audience picker
 *  and the wrap targets are the SAME list. `publicJwk` null until published.
 *  ⚠️ Distributed BY THE SERVER — the trust residual in `orgCrypto.ts`. */
export interface OrgMemberPublicKey {
  memberUuid: string;
  publicJwk: string | null;
  role?: string;
  name?: string | null;
  teamUuid?: string | null;
  teamName?: string | null;
  /** True on the CALLER's own row (drives « Votre équipe » in the share dialog). */
  me?: boolean;
}

/** One share DEK wrapped to ONE member (ECIES). `keyVersion` = rotation
 *  counter: evicting an audience member mints n+1 to the remaining ones. */
export interface OrgKeyEnvelope {
  ephPub: string;
  salt: string;
  iv: string;
  wrappedDek: string;
  keyVersion: number;
  v: 1;
}

export interface OrgEncryptedRecord extends EncryptedRecord {
  keyVersion: number;
}

export interface OrgServerRecord extends OrgEncryptedRecord {
  seq: number;
}

/** What `getShareKeys` returns: MY envelopes, the current version, and which
 *  memberUuids hold a current-version envelope (drives admit/rotate). */
export interface OrgScopeKeys {
  envelopes: OrgKeyEnvelope[];
  currentVersion: number;
  holders: string[];
}

/** The org-share transport (backend routes under
 *  `/organizations/:orgUuid/sync/…`). Every call is RBAC- and share-matrix-
 *  gated server-side, replica device only — fail closed. */
export interface OrgScopeTransport {
  getMyMemberKey(): Promise<MemberKeyEnvelope | null>;
  putMemberKey(envelope: MemberKeyEnvelope, replace?: boolean): Promise<MemberKeyEnvelope>;
  listOrgMemberKeys(orgUuid: string): Promise<OrgMemberPublicKey[]>;
  listShares(orgUuid: string): Promise<OrgShareInfo[]>;
  proposeShare(
    orgUuid: string,
    proposal: { scope: OrgScope; audience: { kind: ShareAudienceKind; teamUuid?: string; targetUuid?: string }; label: string; itemCount?: number },
  ): Promise<OrgShareInfo | null>;
  decideShare(orgUuid: string, shareUuid: string, approve: boolean): Promise<OrgShareInfo | null>;
  revokeShare(orgUuid: string, shareUuid: string): Promise<void>;
  getShareKeys(orgUuid: string, shareUuid: string): Promise<OrgScopeKeys>;
  putShareKeys(
    orgUuid: string,
    shareUuid: string,
    keyVersion: number,
    envelopes: { memberUuid: string; envelope: OrgKeyEnvelope }[],
  ): Promise<void>;
  getShareRecords(
    orgUuid: string,
    shareUuid: string,
    since: number,
  ): Promise<{ records: OrgServerRecord[]; seq: number }>;
  putShareRecords(orgUuid: string, shareUuid: string, records: OrgEncryptedRecord[]): Promise<number>;
  listNotifications(orgUuid: string): Promise<OrgNotification[]>;
  readNotification(orgUuid: string, id: number): Promise<void>;
}
