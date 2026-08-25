/** Desktop cross-device vault sync + org audit (barrel). See `client.ts`. */
export { pushConv, pullConv, reportAudit, listDevices, revokeDevice, registerDevice, getOrgProfile, setOrgCacheUser, SYNC_ENABLED } from "./client";
export { useVaultSync } from "./useVaultSync";
export { useConvSync } from "./useConvSync";
export { useIntegrationSync } from "./useIntegrationSync";
export { pullSyncedIntegrations } from "./integrationSync";
export { useUserdataSync } from "./useUserdataSync";
export { useCoffreSync } from "./useCoffreSync";
export { useOrgScopeSync } from "./useOrgScopeSync";
export { resetOrgKeys, orgSharesHost } from "./orgScopeSync";
export { getSyncPassphrase, setSyncPassphrase, clearSyncPassphrase } from "./passphrase";
export { syncHost } from "./host";
