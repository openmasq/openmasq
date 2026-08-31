// @openmasq/i18n — le catalogue de traduction TYPÉ, sans React, sans bibliothèque.
// La couche React (provider + `useT`) vit dans `@openmasq/ui` : ce package reste
// importable par `main`, `emails` et le backend, qui n'ont pas de React.
export type {
  Messages,
  SettingsTab,
  SettingsEntry,
  PrivacyLevelCopy,
  DownloadFormatCopy,
  PlanTierCopy,
  GuideChapterCopy,
  ProviderKeyCopy,
  ConnectorCopy,
  ModelCopy,
  RedactionCategoryCopy,
} from "./messages";
export {
  type Locale,
  MESSAGES,
  LOCALES,
  DEFAULT_LOCALE,
  isLocale,
  resolveLocale,
  getMessages,
} from "./locale";
