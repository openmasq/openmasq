/** Desktop cross-device vault sync + org audit (barrel). See `client.ts`. */
export { pushConv, pullConv, reportAudit, listDevices, revokeDevice, registerDevice, getOrgProfile, SYNC_ENABLED } from "./client";
export { setOrgCacheUser } from "./orgCache";
export { useVaultSync } from "./useVaultSync";
export { useConvSync } from "./useConvSync";
export { useIntegrationSync } from "./useIntegrationSync";
export { pullSyncedIntegrations } from "./integrationSync";
export { useUserdataSync } from "./useUserdataSync";
export { useVaultTermsSync } from "./useVaultTermsSync";
export { useOrgScopeSync } from "./useOrgScopeSync";
export { resetOrgKeys, orgSharesHost } from "./orgScopeSync";
export { getSyncPassphrase, setSyncPassphrase, clearSyncPassphrase } from "./passphrase";
export { syncHost } from "./host";
