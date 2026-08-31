// Shared MCP vocabulary — leaf module (no runtime deps beyond the SDK types; the
// `import type` below is erased at compile time), so every mcp/ sub-module can
// import it without a cycle.
import type { CredMode } from "../credMode";

// The controllable-browser connector is a single fixed instance (not multi-account).
export const BROWSER_ID = "browser";

/**
 * The live-connection registry (see `registry.ts`) owns the connections to remote
 * MCP "connector" servers (Notion, Gmail, …); the connect flows (`connect.ts`) drive
 * the OAuth login (loopback redirect + system browser); `callTool.ts` routes tool
 * calls. Everything returns RAW (real) tool data — redaction is the renderer's job
 * (it wraps every call in the conversation vault). The main process never sees the vault.
 */
export interface McpServerInfo {
  id: string;
  name: string;
  url: string;
  kind: "http" | "stdio" | "local-oauth" | "browser";
  connected: boolean;
  authorized: boolean;
  toolCount?: number;
  error?: string;
  /** The catalog connector this instance is an account of (multi-account, direct).
   *  Equals `id` for a first/only account. */
  connectorId?: string;
  /** Human account label (email / "Compte N") for a multi-account instance. */
  label?: string;
  /** desktop-direct (local-oauth): which credentials it's configured to use. */
  credMode?: CredMode;
  /** Local (stdio) path grants, by param key — the authorized folders. These are the
   *  user's own folders, not a secret: the connector's card shows them and
   *  allows adding/removing without disconnecting. Absent for other types. */
  params?: Record<string, string[]>;
  /** desktop-direct + `byo`: the user's OWN client id/secret are already stored on
   *  this machine — so the "Mes clés" form can say so + let them be reused without
   *  re-entry (the secret is never surfaced back to the renderer). */
  hasCreds?: boolean;
}

// Asks the RENDERER which access mode to use when connecting a connector that
// allows BOTH signed-in and anonymous access (Firecrawl…): "account" (the user's
// real credits/quotas/scope) vs "anonymous" (limited).
export type McpAuthChoice = "account" | "anonymous";
