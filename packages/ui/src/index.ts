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
// À appeler AVANT le premier rendu, comme `configureAnalytics` : ce build a-t-il un
// service hébergé (passerelle + comptes) ? Non ⇒ les modèles « inclus » redeviennent
// des modèles à clé et rien ne promet d'abonnement (`send/platformAccess.ts`).
export { configurePlatformAccess } from "./send/platformAccess";

export { useChatStore } from "./state/store";
export type { ChatStore } from "./state/store";
// Call BEFORE the first React render to theme <html> pre-paint (avoids the splash
// green→blue flash — the store's own theme effect runs only after mount).
export { applyPersistedTheme } from "./state/theme";
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
// La coque de modale et LA primitive de menu : deux consommateurs chacune (l'app et la
// console web), ce qui est exactement ce qui fait sortir une pièce du paquet — sans ça,
// la console redessinait sa propre coque (avec sa propre scrim) et ré-écrivait la
// fermeture au clic-dehors à la main.
export { ModalShell } from "./containers/modals/ModalShell";
export { usePopover, type PopoverApi, type PopoverAnchor } from "./hooks/usePopover";
// LE loader du produit — les cinq barres du redaction qui balaient. Sorti pour la même
// raison que les deux au-dessus : la console web en est le second appelant, et elle
// écrivait « Chargement… » en texte nu là où l'app fait tourner la marque.
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
// Sort du tonneau parce qu'il a un SECOND appelant : le pont e2e du bureau, qui servait
// le journal d'une conversation avec sa propre copie du prédicat. Qui voit quelle entrée
// est une règle de confidentialité — elle n'existe qu'à un endroit (règle 9).
export { isEntryVisibleIn } from "./state/debugScope";

// Les MODÈLES de workflow livrés + le remplissage de leurs `{accolades}`. Exportés
// pour que la suite e2e du desktop rejoue le prompt RÉELLEMENT livré au lieu d'une
// copie qui dériverait (`apps/desktop/e2e/workflows/templates.ts`).
export {
  ROUTINE_SUGGESTIONS,
  fillTemplate,
  templateServers,
  type RoutineSuggestion,
} from "./suggestions";

// Le squelette COMMUN d'un canal de sync E2E (pull au chargement + à la reprise,
// push après stabilisation). Desktop et mobile en tenaient chacun leur copie pour
// les trois canaux — six fichiers quasi identiques dont un seul détail diffère
// vraiment (comment la plateforme observe la « reprise »). Voir `hooks/useSyncChannel.ts`.
export {
  useSyncChannel,
  onWindowFocus,
  onDocumentVisible,
  PUSH_SETTLE_MS,
  type ResumeSignal,
  type SyncChannelOptions,
} from "./hooks/useSyncChannel";
