import { useChatStore, AppShell, ErrorBoundary, I18nProvider, resolveLocale } from "@openmasq/ui";
import { useVaultTermsSync, useConvSync, useIntegrationSync, useOrgScopeSync, useUserdataSync, useVaultSync } from "./sync";
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
  useVaultTermsSync(store);
  // The ORGANIZATION's shared scopes (org Coffre + org compétences) — E2E to
  // the members via per-member envelopes; member devices pull, admin devices
  // also push and drive the recipient set. No-op outside an organization.
  useOrgScopeSync(store);

  // The interface's LANGUAGE. `Settings.language` is the source of truth once the blob is
  // loaded (and syncs across devices like other settings); as long as it is
  // absent, the provider falls back to the HOST's language (`initialLocale`), so an
  // English speaker starts in English without configuring anything. A language change is persisted
  // to settings via `onLocaleChange`.
  const forcedLocale = resolveLocale(store.settings.language) ?? undefined;

  // A render-time throw anywhere in the tree used to blank the whole window (no
  // boundary) — now it shows a recoverable error card instead.
  return (
    <ErrorBoundary>
      <I18nProvider
        locale={forcedLocale}
        onLocaleChange={(locale) => store.setSettings((s) => ({ ...s, language: locale }))}
      >
        {/* Programmatic driver for the agentic loop, active ONLY under a
            test launch (main flag) — see `e2eBridge.tsx`. */}
        <E2eBridge store={store} />
        <AppShell store={store} />
      </I18nProvider>
    </ErrorBoundary>
  );
}
