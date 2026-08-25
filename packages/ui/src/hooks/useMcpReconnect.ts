import { useEffect, useState } from "react";
import { useHost } from "../host";

export interface McpReconnectItem {
  id: string;
  name: string;
}

/**
 * Tracks remote MCP connectors that dropped UNEXPECTEDLY (their backend closed the
 * transport) and need a manual reconnect — main tears them down and pushes the
 * current list over `host.mcp.onNeedsReconnect`. Drives the app's "reconnexion
 * nécessaire" status chip (`containers/shell/shellNotice.ts`). `dismiss` hides it
 * until the next change. No host / no bridge ⇒ always empty (nothing ever shows).
 */
export function useMcpReconnect(): { items: McpReconnectItem[]; dismiss: () => void } {
  const host = useHost();
  const [items, setItems] = useState<McpReconnectItem[]>([]);
  useEffect(() => {
    return host.mcp?.onNeedsReconnect?.((next) => setItems(next)); // l'unsubscribe
  }, [host]);
  return { items, dismiss: () => setItems([]) };
}
