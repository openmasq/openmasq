// @openmasq/i18n — the TYPED translation catalogue, no React, no library.
// The React layer (provider + `useT`) lives in `@openmasq/ui`: this package stays
// importable by the desktop main process and other React-free consumers.
export type {
  Messages,
  SettingsTab,
  SettingsEntry,
  StarterId,
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
