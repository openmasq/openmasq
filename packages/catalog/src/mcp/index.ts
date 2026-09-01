/**
 * Unified MCP CONNECTOR catalog — the single source of truth for "which MCP
 * servers exist", shared by the desktop UI and the org admin console.
 *
 * Historically the catalog was split across three registries with no common type:
 *   • remote HTTP+OAuth (DCR one-click) presets — `packages/ui/.../mcpPresets.ts`
 *   • local stdio allowlist                     — `apps/desktop/.../mcp/catalog.ts`
 *   • broker sidecar platforms                  — `apps/mcp-broker/.../platforms/registry.ts`
 * This module owns ONE list that absorbs all three behind a single `transport`
 * discriminator, so the admin can govern access to the same ids the desktop uses.
 *
 * NOTE: the runnable command/args of stdio servers and the OAuth upstream creds of
 * broker platforms deliberately DO NOT live here — those stay secret in
 * desktop-main / apps/mcp-broker respectively. This catalog carries display metadata only.
 *
 * Split by concern (hard rule 2): `types` (the discriminated shapes), `categories`
 * (the canonical category vocabulary + grouping), `connectors/{remote,stdio,broker,
 * direct,builtin}` (the five source data tables — private), `registry` (dedupe + the
 * public `MCP_CONNECTORS`/`findConnector`), `authTag` (the auth-badge derivation). This
 * barrel re-exports the SAME public surface, so `@openmasq/catalog/mcp` is unchanged.
 */
export type { McpTransport, McpAuth, McpCategory, McpConnector, McpAuthTag } from "./types";
export {
  MCP_CATEGORIES,
  MCP_CATEGORY_OTHER,
  mcpCategoryLabel,
  groupByMcpCategory,
} from "./categories";
export {
  MCP_CONNECTORS,
  STORAGE_CONNECTORS,
  connectorIdFromInstance,
  findConnector,
  connectorBrandName,
  connectorHosts,
} from "./registry";
export { BROWSER_CONNECTOR_ID } from "./connectors/builtin";
export { mcpAuthTag, mcpAuthShape, type McpAuthShape, type McpAuthVariant } from "./authTag";
export { writeRisk, needsSystemConfirm, type WriteRisk, type WriteRiskContext } from "./writeRisk";
export {
  READ_VERB,
  WRITE_VERB,
  DESTRUCTIVE_VERB,
  COMPOUND_WRITE,
  AMBIGUOUS_WRITE_VERB,
  classifyToolWrite,
  isAmbiguousWrite,
  type ToolWriteAnnotations,
} from "./writeVocabulary";
export {
  CONFIRMATION_POLICY,
  confirmationSurface,
  composeConfirmationMode,
  confirmationModeLocked,
  parseConfirmationMode,
  type ConfirmationMode,
  type ConfirmationSurface,
  type ConfirmationFacts,
  type ConfirmationCondition,
  type ConfirmationRule,
} from "./confirmationPolicy";
