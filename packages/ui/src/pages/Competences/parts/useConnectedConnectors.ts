import { useEffect, useState } from "react";
import { connectorIdFromInstance } from "@openmasq/catalog/mcp";
import { useHost } from "../../../host";

/**
 * The set of catalog-connector ids that currently have at least one CONNECTED
 * account, folded from live `host.mcp.list()` (instance ids → their connector).
 * Read-only : l'éditeur de compétence montre un repère « connecté », pour qu'on sache
 * quelles intégrations une compétence à connecteurs peut réellement atteindre maintenant.
 *
 * Re-queries on `onChanged` — the silent startup reconnect lands AFTER the first
 * fetch, so a genuinely reconnected connector would otherwise read as offline
 * until the modal is reopened. Absent `host.mcp` ⇒ empty set (the picker still
 * works; nothing shows connected).
 */
export function useConnectedConnectors(): Set<string> {
  const host = useHost();
  const [ids, setIds] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    const mcp = host.mcp;
    if (!mcp) return;
    const refresh = () =>
      mcp
        .list()
        .then((servers) =>
          setIds(
            new Set(
              servers
                .filter((s) => s.connected)
                .map((s) => connectorIdFromInstance(s.connectorId ?? s.id)),
            ),
          ),
        )
        .catch(() => {});
    refresh();
    return mcp.onChanged?.(refresh);
  }, [host]);
  return ids;
}
