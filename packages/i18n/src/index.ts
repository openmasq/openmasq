// @openmasq/i18n — the TYPED translation catalogue, no React, no library.
// The React layer (provider + `useT`) lives in `@openmasq/ui`: this package stays
// importable by `main`, `emails` and the backend, which have no React.
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
