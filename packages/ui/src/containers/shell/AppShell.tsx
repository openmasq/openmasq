import { useCallback, useState } from "react";
import { Provider } from "react-redux";
import type { ChatStore } from "../../state/store";
import { store as reduxStore } from "../../state/redux";
import { ChatStoreProvider } from "../providers/chatStore";
import { OpenConnectorProvider } from "../providers/connectors";
import { RedactionProvider } from "../../send/redaction";
import { McpAuthChoiceModal } from "../modals";
import { ConnectorModalHost } from "../../pages/Settings/mcp";
import { DesktopShell } from "./DesktopShell";
import { MobileShell } from "./mobile/MobileShell";
import { useHost } from "../../host";
import { useUpdateQuiescence } from "../../state/effects/useUpdateQuiescence";
import { useFeatureFlags } from "../../state/featureFlags";

/**
 * The redact app shell — the store, the redux provider and the redaction contexts, then
 * ONE presentation.
 *
 * **The split is presentation-only.** Everything the shell knows and can do lives in
 * `useShell.ts` with no JSX; `DesktopShell` and `mobile/MobileShell` are two arrangements
 * of the same values. That is the boundary to keep: a phone differs in navigation and
 * screen composition, never in what the app can do — so a platform difference belongs in
 * one of the two shells (or a mobile screen of its own), never as a `mobile ?` branch
 * threaded through a shared component.
 */
export function AppShell({ store, variant }: { store: ChatStore; variant?: "mobile" }) {
  // Les PORTES gouvernables (Mémoire / Bibliothèque / Compétences) : le cache s'applique
  // dès la première frame, le relais raffraîchit derrière. Monté ICI plutôt que dans
  // chaque app hôte — c'est la coquille qui rend les sections. `state/featureFlags.ts`.
  useFeatureFlags();
  // Sonde de QUIESCENCE de l'auto-installation des mises à jour : main demande « es-tu
  // occupé ? » avant de redémarrer tout seul (app en arrière-plan/inactive, build
  // téléchargé). Ici parce que la coquille voit tout ce qui compte : envoi en vol,
  // brouillons. No-op quand le Host n'expose pas la sonde (aperçu web, mobile).
  useUpdateQuiescence({
    host: useHost(),
    isStreaming: store.isStreaming,
    conversations: store.conversations,
    getDraft: store.getDraft,
  });
  // La modale d'un connecteur s'ouvre depuis N'IMPORTE OÙ (panneau « Dossiers »,
  // bannière de reconnexion, carte d'intégration en conversation) : la coquille tient la
  // demande, `containers/providers/connectors` en est le canal, et l'implémentation
  // reste celle des Réglages. Le nonce fait ré-ouvrir le MÊME connecteur après
  // fermeture. Monté seulement pendant la demande — voir `ConnectorModalHost`.
  const [connector, setConnector] = useState<{ id: string; n: number } | null>(null);
  const openConnector = useCallback(
    (id: string) => setConnector((c) => ({ id, n: (c?.n ?? 0) + 1 })),
    [],
  );

  return (
    <Provider store={reduxStore}>
      <RedactionProvider
        settings={store.settings}
        orgForcedCategories={store.orgProfile?.forcedCategories}
      >
        <ChatStoreProvider store={store}>
          <OpenConnectorProvider value={openConnector}>
            {variant === "mobile" ? <MobileShell chat={store} /> : <DesktopShell chat={store} />}
          </OpenConnectorProvider>
        </ChatStoreProvider>
        <McpAuthChoiceModal />
        {connector && (
          <ConnectorModalHost
            key={connector.n}
            connectorId={connector.id}
            nonce={connector.n}
            allowedMcpIds={store.orgProfile?.allowedMcpIds}
            onClose={() => setConnector(null)}
          />
        )}
      </RedactionProvider>
    </Provider>
  );
}
