/**
 * @openmasq/sync — cross-device vault sync (E2E encrypted) + org audit reporting.
 *
 * Three channels, one package, shared by desktop / extension / mobile:
 *  • VAULT SYNC   — encrypt the reversible redaction map on-device, store an opaque
 *                   blob per web-thread id, pull+merge on another device.
 *  • RECORD SYNC  — conversations + the integrations directory as an E2E encrypted
 *                   append-only oplog (v2: per-conversation DEK wrapped by the
 *                   passphrase KEK). Bidirectional desktop⇄mobile; the extension is
 *                   push-only, ENFORCED server-side per device capability.
 *  • ORG AUDIT    — report aggregate PII-class counts (no values) to the org's
 *                   compliance dashboard when the account belongs to an org.
 *
 * Pure TS + WebCrypto + fetch — no platform APIs. Each surface supplies a
 * `SyncTransport` (usually `httpTransport`) and a passphrase getter.
 */
export { createVaultSync, mergeVaultPayloads, isVaultSubset } from "./vaultClient";
export type { VaultSync, VaultSyncOptions } from "./vaultClient";
export { encryptVault, decryptVault, generatePassphrase } from "./crypto";
export {
  createConvKey,
  openConvKey,
  rewrapConvKey,
  encryptRecord,
  decryptRecord,
} from "./crypto";
export { mergeRecords, liveView, compareRecords, nextLamport } from "./records";
export type { LiveConversation } from "./records";
export { createRecordSync, isCryptoFailure } from "./recordClient";
export {
  emptyConvSyncState,
  toSyncedMessage,
  emitConvRecords,
  emitDeletions,
} from "./convSync";
export type { ConvSyncState, SyncedMessage, SyncedConvMeta } from "./convSync";
export { applyPulled, absorbPulled } from "./convSyncApply";
export type { ApplyOutcome } from "./convSyncApply";
export {
  emptyIntegrationSyncState,
  emitIntegrationRecords,
  applyIntegrationRecords,
} from "./integrations";
export type { SyncedIntegration, IntegrationSyncState } from "./integrations";
export {
  emptyUserdataSyncState,
  emitUserdataRecords,
  absorbUserdataRecords,
  snapshotOfSettings,
  settingsPatchOf,
} from "./userdata";
export type {
  SyncedSkill,
  SyncedWorkflow,
  SyncedMemoryCard,
  UserdataPayload,
  UserdataSnapshot,
  UserdataSettingsLike,
  UserdataSyncState,
} from "./userdata";
export { emptyVaultTermsSyncState, emitVaultTermRecords, absorbVaultTermRecords } from "./vaultTerms";
export type { SyncedVaultTerm, VaultTermsSyncState } from "./vaultTerms";
export type { RecordSync, RecordSyncOptions, PulledRecords } from "./recordClient";
export { verifyPassphrase, type PassphraseVerdict } from "./verifyPassphrase";
export { accountPassphrase } from "./accountPassphrase";
export { reportedLedger } from "./reportedLedger";
export type { ReportedLedger, ReportedLedgerOptions, OpenedLedger } from "./reportedLedger";
export type { AccountPassphrase, AccountPassphraseOptions, PassphraseStore } from "./accountPassphrase";
export { INTEGRATIONS_SCOPE, EXTENSION_SCOPE_PREFIX, USERDATA_SCOPE, VAULT_TERMS_SCOPE } from "./types";
export type {
  SyncRecord,
  SyncRecordKind,
  EncryptedRecord,
  ServerRecord,
  ConvKeyEnvelope,
  RecordTransport,
} from "./types";
export {
  deriveRedactionEvent,
  deriveRedactionEvents,
  providerFromModelId,
  type AuditSource,
} from "./events";
export { httpTransport, type HttpTransportOptions } from "./transport/http";
export { orgHttpTransport } from "./transport/orgHttp";
// ORG-SHARE channel — coffre + skills shared to the org / one team /
// one person, E2E to the audience, APPROVAL before reading (orgScope/).
export {
  createOrgScopeSync,
  audienceMembers,
  type OrgScopeSync,
  type OrgScopeSyncOptions,
  type ShareProposal,
  type ShareMembershipResult,
} from "./orgScope/orgClient";
export {
  createMemberKey,
  openMemberKey,
  rewrapMemberKey,
  mintOrgDek,
  importOrgDek,
  wrapOrgDek,
  openOrgDek,
  orgKeyContext,
  orgRecordConvId,
} from "./orgScope/orgCrypto";
export {
  ORG_VAULT_SCOPE,
  ORG_USERDATA_SCOPE,
  ORG_SCOPES,
  SHARE_AUDIENCES,
} from "./orgScope/orgTypes";
export type {
  OrgScope,
  ShareAudienceKind,
  ShareAudience,
  ShareStatus,
  OrgShareInfo,
  OrgNotification,
  MemberKeyEnvelope,
  OrgMemberPublicKey,
  OrgKeyEnvelope,
  OrgEncryptedRecord,
  OrgServerRecord,
  OrgScopeKeys,
  OrgScopeTransport,
} from "./orgScope/orgTypes";
export type {
  VaultPayload,
  EncryptedBlob,
  SyncedVault,
  SyncedVaultMeta,
  OrgRef,
  OrgProfile,
  ModelPolicyRow,
  RedactionEvent,
  SyncTransport,
  DeviceIdentity,
  DeviceInfo,
} from "./types";

