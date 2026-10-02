import type { ConnectorScopes } from "@openmasq/connectors";

/**
 * A connector's credential mode: `"byo"` (the user's own keys) or the built-in mode (the
 * platform's OAuth keys).
 *
 * ⚠️ The built-in VALUE is PERSISTED (`accounts/mcp-<uid>.json` of the installed fleet) and
 * equals the brand slug (`BRAND.slug`, rule 9); it is never renamed — renaming it would orphan
 * already-configured connectors. The type stays `string`: a type literal can't derive from
 * JSON, and the only comparison that decides is `=== "byo"` (everything else is built-in).
 */
export type CredMode = string;

/** The scopes of the requested mode. The `managed` field of `ConnectorScopes` is NEUTRAL:
 *  only the PERSISTED built-in mode carries the brand slug. */
export const scopesForMode = (scopes: ConnectorScopes, mode?: string): string[] =>
  mode === "byo" ? scopes.byo : scopes.managed;
