import { useCallback } from "react";
import { connectorErrorReason } from "./connectorErrorReason";
import { useHost, type McpServerInfo } from "../../../host";
import { captureEvent } from "../../../analytics";

/**
 * Add a USER-DEFINED remote MCP server, then connect it.
 *
 * Main owns every decision about it (`mcp/server/customSpec.ts`): it mints the id,
 * requires https with no inline credentials, and SSRF-guards the endpoint BEFORE the spec
 * is persisted. So a refusal arrives as `info.error` on an info with an empty `id` — never
 * as a throw — and this returns that message for the form to show inline.
 *
 * ⚠️ Analytics carry the CONSTANT `"custom"` as the provider: the minted id is per-install
 * and the URL is the user's own infrastructure (and may carry an API key in its query
 * string). Neither belongs in an event.
 */
export function useAddCustomServer(deps: {
  /** Merge the connect result into the tab's server list (+ its connect event). */
  applyInfo: (info: McpServerInfo, provider: string) => void;
  /** Re-read the server list from the host. */
  refresh: () => void;
}): (input: { name: string; url: string; apiKey?: string }) => Promise<string | null> {
  const host = useHost();
  const { applyInfo, refresh } = deps;
  return useCallback(
    async (input) => {
      if (!host.mcp?.addCustom) return "Indisponible sur cette plateforme.";
      try {
        const info = await host.mcp.addCustom(input);
        if (!info.id || info.error) {
          captureEvent({ name: "connector_error", provider: "custom", reason: connectorErrorReason(info.error) });
          return info.error || "Ajout impossible.";
        }
        applyInfo(await host.mcp.connect(info.id), "custom");
        return null;
      } catch (e) {
        captureEvent({ name: "connector_error", provider: "custom", reason: connectorErrorReason(e) });
        return "Ajout impossible.";
      } finally {
        refresh();
      }
    },
    [host, applyInfo, refresh],
  );
}
