/**
 * Emits the integrations DIRECTORY on connect/disconnect: observes the MCP
 * connection state (`host.mcp.onChanged` + mount) and pushes the diff as E2E
 * records. Config only — see `integrationSync.ts`. Best-effort; inert without
 * a passphrase / signed out.
 */
import { useEffect } from "react";
import { useHost } from "@openmasq/ui";
import { pushIntegrationDirectory } from "./integrationSync";

export function useIntegrationSync(): void {
  const host = useHost();

  useEffect(() => {
    const mcp = host.mcp;
    if (!mcp) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const push = () => {
      clearTimeout(timer);
      // Debounced: connect flows fire several onChanged in a row.
      timer = setTimeout(() => {
        void mcp
          .list()
          .then((servers) => pushIntegrationDirectory(servers))
          .catch(() => {});
      }, 1000);
    };
    push();
    const off = mcp.onChanged?.(push);
    return () => {
      clearTimeout(timer);
      off?.();
    };
  }, [host]);
}
