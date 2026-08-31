import { BRAND } from "@openmasq/branding";
import type { ConnectorScopes } from "@openmasq/connectors";

/**
 * The "built-in" credential mode of a connector (the platform's OAuth keys,
 * as opposed to `"byo"` — the user's own keys).
 *
 * ⚠️ Its VALUE is PERSISTED (`accounts/mcp-<uid>.json` of the installed fleet) and equals the
 * brand slug: it therefore comes from `@openmasq/branding` (rule 9) and is never renamed —
 * renaming it would orphan already-configured connectors. The type stays `string`: a
 * type literal can't derive from JSON, and the only comparison that decides is
 * `=== "byo"` (everything else is the built-in mode).
 */
export const BUILTIN_CRED_MODE: string = BRAND.slug;

/** `BUILTIN_CRED_MODE` or `"byo"` — see above for the wide type. */
export type CredMode = string;

/** The scopes of the requested mode. The `managed` field of `ConnectorScopes` is NEUTRAL:
 *  only the PERSISTED mode (`BUILTIN_CRED_MODE`) carries the brand slug. */
export const scopesForMode = (scopes: ConnectorScopes, mode?: string): string[] =>
  mode === "byo" ? scopes.byo : scopes.managed;
