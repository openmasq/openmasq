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
 * Un connecteur PRÉCIS est-il connecté — `null` tant qu'on ne le sait pas encore.
 *
 * La nuance compte pour une surface qui REMPLACE sa vue quand c'est « non » (le panneau
 * du navigateur) : `[]` est aussi ce qu'on a avant la première réponse de `list()`, donc
 * traiter « pas encore chargé » comme « déconnecté » ferait clignoter l'appel à l'action
 * à chaque ouverture. Même abonnement, même hôte que ci-dessus.
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
    // Pas de pont MCP (aperçu web) : rien ne sera jamais connecté, et c'est SU — sinon
    // l'appelant attend indéfiniment un état qui n'arrivera pas.
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
          // Best-effort — mais un échec de listing est une RÉPONSE : sans ça, la surface
          // qui attend `loaded` resterait sur son écran de chargement pour toujours.
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
 * « Le navigateur agent est-il HORS SERVICE ici ? » — la définition, une seule fois.
 *
 * ⚠️ Elle a DEUX lecteurs (`containers/shell/hooks/useAgentBrowserVisibility.ts`, global,
 * et `pages/ChatWorkspace/BrowserPanel`, côté panneau) et ils DOIVENT dire la même chose.
 * Ils ne le disaient pas : le panneau exigeait aussi `host.mcp.enableBrowser` (« on peut
 * proposer de l'activer »), le gate global non. Sur un hôte sans cette capacité, le
 * panneau montrait donc « Chargement du navigateur agent… » pendant que le gate global
 * gardait la fenêtre native éteinte — un chargement qui n'aboutissait JAMAIS, sans rien à
 * cliquer. C'est le même piège que `modalGate.ts` documente pour les modales : deux
 * propriétaires d'une seule fenêtre, deux définitions.
 *
 * `null` (pas encore su) n'est PAS hors service : on ne conclut que sur un « non » certain.
 */
export function useAgentBrowserOffline(): boolean {
  const host = useHost();
  const connected = useMcpConnectorConnected(BROWSER_CONNECTOR_ID);
  return connected === false && !!host.mcp?.enableBrowser;
}
