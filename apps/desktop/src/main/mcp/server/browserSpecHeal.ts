import { addServer, getServer } from "../persist";
import { isBrowserAgentEnabled } from "../browser";
import { BROWSER_ID } from "./types";

/**
 * AUTO-REPAIR of the browser spec, called by `setMcpUser` once persistence is
 * re-scoped to the account. The opt-in is a MACHINE flag (`browser-agent.on`) but the spec
 * lives in the PER-ACCOUNT store — and the renderer's pre-connect used to run before
 * the account was adopted: the flag got written, the spec went into a persist with no
 * scope (no-op), and every install stayed "opted-in, never connected" (the model
 * kept asking "for browser access" on every news question). Here we run in
 * the right scope: an account missing the spec gets it, and `mcpReconnectStored`
 * connects it like the others. The explicit opt-out (`mcpDisableBrowser`) removes flag AND
 * spec, so it stays honoured; signed-out (`userId` null) nothing gets added.
 */
export function healBrowserSpec(userId: string | null): void {
  if (!userId || !isBrowserAgentEnabled() || getServer(BROWSER_ID)) return;
  addServer({ id: BROWSER_ID, connectorId: BROWSER_ID, name: "Navigateur", kind: "browser" });
}
