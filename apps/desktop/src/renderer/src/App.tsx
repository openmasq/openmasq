import { useChatStore, AppShell, ErrorBoundary } from "@openmasq/ui";
import { useCoffreSync, useConvSync, useIntegrationSync, useOrgScopeSync, useUserdataSync, useVaultSync } from "./sync";
import { E2eBridge } from "./e2eBridge";

// The desktop app reaches models via real API keys only. The keyless web-session
// mode (driving a signed-in ChatGPT/Claude webview) now lives in the browser
// extension — the desktop no longer mounts any WebSessionBridge / webview.
export function App() {
  const store = useChatStore();

  // Cross-device sync (E2E) + org audit. No-op until the user sets a sync
  // passphrase and the app is built with VITE_BACKEND_URL. Two channels:
  // the vault (reversible redaction map) and the conversation records.
  useVaultSync(store);
  useConvSync(store);
  useIntegrationSync();
  // The user's studio (compétences / workflows / mémoire) — E2E-encrypted on
  // the reserved `@userdata` record scope, same passphrase, same envelope.
  useUserdataSync(store);
  // The Coffre (always-redacted terms) — its own `@coffre` scope, the one scope
  // the extension may also read/write (bidirectional across all surfaces).
  useCoffreSync(store);
  // The ORGANIZATION's shared scopes (org Coffre + org compétences) — E2E to
  // the members via per-member envelopes; member devices pull, admin devices
  // also push and drive the recipient set. No-op outside an organization.
  useOrgScopeSync(store);

  // A render-time throw anywhere in the tree used to blank the whole window (no
  // boundary) — now it shows a recoverable error card instead.
  return (
    <ErrorBoundary>
      {/* Pilote programmatique de la boucle agentique, actif UNIQUEMENT sous un
          lancement de test (drapeau de main) — voir `e2eBridge.tsx`. */}
      <E2eBridge store={store} />
      <AppShell store={store} />
    </ErrorBoundary>
  );
}
