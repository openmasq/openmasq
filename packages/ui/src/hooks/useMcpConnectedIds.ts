import { useEffect, useState } from "react";
import { BROWSER_CONNECTOR_ID, connectorIdFromInstance } from "@openmasq/catalog/mcp";
import { useHost } from "../host";

/**
 * The CONNECTOR ids currently connected, live. Reads `host.mcp.list()` on mount and
 * re-reads on every `onChanged` (connect / disconnect / account switch), so a connector
 * the user links in Réglages shows as connected the moment they come back to the chat.
 *
 * Drives the in-chat `IntegrationSuggestions` card's Connecté state — the kit animates
 * idle→connected on a timer because it is a demo; here the connect happens in another
 * window (OAuth), so the only honest signal is the real live set.
 *
 * Instance ids are normalised to their CONNECTOR id (`gmail--a1b2` → `gmail`), since a
 * suggestion names a connector, not one of its accounts. No host / no bridge ⇒ empty
 * (the card simply never shows a connected state).
 */
export function useMcpConnectedIds(): string[] {
  return useConnected().ids;
}

/**
 * Is a SPECIFIC connector connected — `null` as long as it isn't known yet.
 *
 * The nuance matters for a surface that REPLACES its view when it's "no" (the
 * browser panel): `[]` is also what we have before the first `list()` response, so
 * treating "not loaded yet" as "disconnected" would flash the call-to-action on
 * every opening. Same subscription, same host as above.
 */
function useMcpConnectorConnected(connectorId: string): boolean | null {
  const { ids, loaded } = useConnected();
  return loaded ? ids.includes(connectorId) : null;
}

function useConnected(): { ids: string[]; loaded: boolean } {
  const host = useHost();
  const [ids, setIds] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const mcp = host.mcp;
    // No MCP bridge (web preview): nothing will ever be connected, and that's KNOWN —
    // otherwise the caller waits indefinitely for a state that will never arrive.
    if (!mcp) {
      setLoaded(true);
      return;
    }
    let alive = true;
    const refresh = (): void => {
      void mcp
        .list()
        .then((servers) => {
          if (!alive) return;
          const next = servers
            .filter((s) => s.connected)
            .map((s) => connectorIdFromInstance(s.id));
          // Only swap when the SET actually changed — `list()` returns fresh objects on
          // every `onChanged`, and a new array identity would re-render every bubble.
          setIds((prev) =>
            prev.length === next.length && next.every((id) => prev.includes(id)) ? prev : next,
          );
          setLoaded(true);
        })
        .catch(() => {
          // Best-effort — but a listing failure IS a response: without this, the
          // surface waiting on `loaded` would stay on its loading screen forever.
          if (alive) setLoaded(true);
        });
    };
    refresh();
    const off = mcp.onChanged?.(refresh);
    return () => {
      alive = false;
      off?.();
    };
  }, [host]);

  return { ids, loaded };
}

/**
 * "Is the agent browser OFFLINE here?" — the definition, in one place.
 *
 * ⚠️ It has TWO readers (`containers/shell/hooks/useAgentBrowserVisibility.ts`, global,
 * and `pages/ChatWorkspace/BrowserPanel`, panel side) and they MUST say the same thing.
 * They didn't: the panel also required `host.mcp.enableBrowser` ("we can offer to
 * enable it"), the global gate didn't. On a host without that capability, the panel
 * therefore showed "Loading agent browser…" while the global gate kept the native
 * window off — a loading state that NEVER resolved, with nothing to click. It's the
 * same trap `modalGate.ts` documents for modals: two owners of a single window, two
 * definitions.
 *
 * `null` (not known yet) is NOT offline: we only conclude on a certain "no".
 */
export function useAgentBrowserOffline(): boolean {
  const host = useHost();
  const connected = useMcpConnectorConnected(BROWSER_CONNECTOR_ID);
  return connected === false && !!host.mcp?.enableBrowser;
}
