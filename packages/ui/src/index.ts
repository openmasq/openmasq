// Styles are shipped as a separate export — consumers import
// "@openmasq/ui/styles.css" so their own bundler handles it.

export * from "./types";
// Re-export the provider id union from @openmasq/llm so consumers (e.g. the
// admin console) can type `provider` fields passed to ModelLogo without taking a
// direct dependency on @openmasq/llm.
export type { ProviderId } from "@openmasq/llm";
export * from "./host";
// The avis (user-feedback) payload — the desktop Host implements the transport, so
// it needs the shape. The vocabularies stay internal (only the modal renders them).
export type { Feedback, FeedbackContext, FeedbackMood, FeedbackCategory } from "./avis/avis";
export * from "./state/billing";
export * from "./prompt/models";
export { hueForProvider } from "./prompt/providerHue";
export * from "./state/usage";
export { configureAnalytics, setAnalyticsConsent, setAnalyticsSuspended, setStableIdSource, captureEvent, captureError, type TrackEvent, type ErrorReport } from "./analytics";
// To call BEFORE the first render, like `configureAnalytics`: does this build have a
// hosted service (gateway + accounts)? No ⇒ « included » models become
// key-based models again and nothing promises an abonnement (`send/platformAccess.ts`).
export { configurePlatformAccess } from "./send/platformAccess";

export { useChatStore } from "./state/store";
export type { ChatStore } from "./state/store";
// Call BEFORE the first React render to theme <html> pre-paint (avoids the splash
// green→blue flash — the store's own theme effect runs only after mount).
export { applyPersistedTheme } from "./state/theme";
// The i18n: the React layer (provider + hooks) and the typed catalogue re-exported for
// consumers (the desktop wraps AppShell in `I18nProvider`, /preview will be able
// to too). The LANGUAGE pre-paint lives INSIDE the provider (`<html lang>` effect), not in
// the bootstrap — the static splash has no translatable text.
export { I18nProvider, useT, type I18nProviderProps } from "./i18n";
// The resolved device language (device key → host → default), usable BEFORE auth:
// the renderer attaches it to the connection so the auth email goes out in the right language.
export { initialLocale } from "./state/locale";
export { type Locale, LOCALES, DEFAULT_LOCALE, resolveLocale, getMessages, type Messages } from "@openmasq/i18n";
export { MissingApiKeyError, CreditsExhaustedError } from "./state/errors";

export { useAuth } from "./state/useAuth";
export type { AuthState } from "./state/useAuth";
export { LoginScreen } from "./pages/Login";

// Brand primitives + icon set (Avatar, Badge, Switch, IconButton, ModelLogo,
// CMark/RedactMark, and the redact line-icon set). Exported so other surfaces —
// notably the org-scoped admin console in apps/web — compose the SAME primitives
// rather than re-implementing them. Purely additive to the public surface.
export * from "./components/brand";

export { AppShell } from "./containers/shell/AppShell";
export { ErrorBoundary } from "./components/feedback/ErrorBoundary";
export { Rail } from "./containers/shell/Rail";
export { Sidebar } from "./containers/shell/Sidebar";
export { ChatView } from "./pages/ChatWorkspace";
export { SettingsView } from "./pages/Settings";
export { LibraryView } from "./pages/Library";
export { MessageBubble } from "./components/message/MessageBubble";
export { ModelSelector } from "./components/ModelSelector";
export { Onboarding } from "./pages/Onboarding/Onboarding";
export { ConfirmDialog } from "./components/feedback/ConfirmDialog";
// The modal shell and THE menu primitive: two consumers each (the app and the
// web console), which is exactly what earns a piece its move out of the package — without that,
// the console used to redraw its own shell (with its own scrim) and hand-rewrite
// click-outside closing.
export { ModalShell } from "./containers/modals/ModalShell";
export { usePopover, type PopoverApi, type PopoverAnchor } from "./hooks/usePopover";
// THE product's loader — the five redaction bars that sweep. Moved out for the same
// reason as the two above: the web console is its second caller, and it
// used to write « Chargement… » as plain text where the app spins the brand.
export { BrandLoader } from "./components/media/BrandLogo";

export {
  store as reduxStore,
  setSection,
  track,
  isDevMode,
  useAppDispatch,
  useAppSelector,
} from "./state/redux";
export type { RootState, AppDispatch, Section } from "./state/redux";

// Debug journal (wire / turn / tool / phase entries + redacted↔original pairs).
// Exported for the desktop E2E bridge, which enables capture and surfaces the
// per-conversation journal to the eval bench — so a looped workflow can be
// diagnosed (e.g. a tool NAME redacted by the NER) instead of guessed at.
export { getDebugLog, setDebugCapture, isDebugCapture, clearDebugLog } from "./state/debug";
export type { DebugEntry, DebugPair, TurnMessage } from "./state/debug";
// Leaves the barrel because it has a SECOND caller: the desktop's e2e bridge, which used to
// serve a conversation's journal with its own copy of the predicate. Who sees which entry
// is a privacy rule — it exists in exactly one place (rule 9).
export { isEntryVisibleIn } from "./state/debugScope";

// The shipped workflow TEMPLATES + the filling of their `{braces}`. Exported
// so the desktop's e2e suite replays the prompt ACTUALLY shipped instead of a
// copy that would drift (`apps/desktop/e2e/workflows/templates.ts`).
export {
  routineIds,
  fillTemplate,
  templateServers,
  type RoutineSuggestion,
} from "./suggestions";

// The COMMON skeleton of an E2E sync channel (pull on load + on resume,
// push after settling). Desktop and mobile each used to keep their own copy for
// the three channels — six near-identical files where only one detail truly
// differs (how the platform observes « resume »). See `hooks/useSyncChannel.ts`.
export {
  useSyncChannel,
  onWindowFocus,
  onDocumentVisible,
  PUSH_SETTLE_MS,
  type ResumeSignal,
  type SyncChannelOptions,
} from "./hooks/useSyncChannel";
