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
  // The governable GATES (Mémoire / Bibliothèque / Compétences): the cache applies
  // from the first frame, the relay refreshes behind it. Mounted HERE rather than in
  // each host app — it's the shell that renders the sections. `state/featureFlags.ts`.
  useFeatureFlags();
  // QUIESCENCE probe for auto-installing updates: main asks « are you
  // busy? » before restarting on its own (app in background/inactive, build
  // downloaded). Here because the shell sees everything that matters: a send in
  // flight, drafts. No-op when the Host doesn't expose the probe (web preview, mobile).
  useUpdateQuiescence({
    host: useHost(),
    isStreaming: store.isStreaming,
    conversations: store.conversations,
    getDraft: store.getDraft,
  });
  // A connector's modal opens from ANYWHERE (« Dossiers » panel,
  // reconnection banner, integration card in a conversation): the shell holds the
  // request, `containers/providers/connectors` is its channel, and the implementation
  // stays the Réglages' own. The nonce makes the SAME connector re-open after
  // closing. Mounted only during the request — see `ConnectorModalHost`.
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
