/**
 * LE CONTRAT de traduction — l'interface que CHAQUE langue implémente.
 *
 * C'est le cœur du choix « catalogue typé, aucune bibliothèque » (cf. `CLAUDE.md`) : une
 * clé manquante ou en trop dans `fr.ts`/`en.ts` est une erreur `tsc`, pas un repli
 * silencieux à l'exécution. Aucun parseur ICU, aucun chargeur runtime dans un produit
 * dont la posture est « rien de non vérifié ne s'exécute » — l'interpolation et les
 * pluriels sont des FONCTIONS TypeScript typées, et les nombres/dates/monnaies passent
 * par `Intl` (présent dans Electron et tout navigateur).
 *
 * ## Comment ajouter une clé
 *
 * 1. l'ajouter dans la TRANCHE qui la porte (`messages/`) ;
 * 2. `tsc` casse sur `fr/` ET `en/` tant que les deux ne l'ont pas — c'est voulu ;
 * 3. une entrée à variable est une fonction `(x) => string`, jamais un gabarit à trous.
 *
 * ## Comment ajouter une LANGUE
 *
 * Un dossier `xx/` dont l'assemblage `satisfies Messages`, ajouté à `MESSAGES` dans
 * `locale.ts` et à l'union `Locale`. Le compilateur exige alors chaque clé : la porte est
 * ouverte, et elle refuse une langue incomplète.
 *
 * Les namespaces suivent les SURFACES, pas les fichiers — un même mot rendu à deux
 * endroits a une seule entrée (règle 9 appliquée à la copie). Ce fichier reste la SEULE
 * liste des namespaces ; les tranches de `messages/` n'existent que pour tenir le cap
 * 300 LOC (règle 1), comme `packages/emails/i18n/`.
 */
import type { AgentMessages } from "./messages/agent";
import type { AvailabilityMessages } from "./messages/availability";
import type { CardsMessages } from "./messages/cards";
import type { ChatMessages, ChromeMessages, ComposerMessages } from "./messages/chrome";
import type { BillingMessages, CommonMessages, NavMessages } from "./messages/common";
import type { ConnectorsMessages } from "./messages/connectors";
import type { ErrorsMessages } from "./messages/errors";
import type { GuideMessages } from "./messages/guide";
import type { LanguageMessages } from "./messages/language";
import type { DocViewsMessages, DownloadsMessages, MenusMessages } from "./messages/menus";
import type {
  ConnectorCatalogMessages,
  ModelCatalogMessages,
  RedactionCatalogMessages,
} from "./messages/catalogCopy";
import type { ByoMessages, McpTabMessages, VersionsTabMessages } from "./messages/mcpTab";
import type { ModalsMessages } from "./messages/modals";
import type { OnboardingMessages } from "./messages/onboarding";
import type {
  PrivacyLevelsMessages,
  RedactTypesMessages,
  WebNavMessages,
} from "./messages/privacy";
import type { ProviderKeysMessages } from "./messages/providerKeys";
import type { SectionsMessages } from "./messages/sections";
import type { ShellMessages } from "./messages/shell";
import type { ViewersMessages } from "./messages/viewers";
import type { SettingsMessages } from "./messages/settings";
import type {
  AccountTabMessages,
  BrowserTabMessages,
  ModelsTabMessages,
  PrivacyTabMessages,
} from "./messages/settingsTabs";
import type {
  BillingTabMessages,
  ImportModalMessages,
  OrgTabMessages,
  SyncTabMessages,
  UsageTabMessages,
} from "./messages/settingsMore";

export type { DownloadFormatCopy } from "./messages/menus";
export type { GuideChapterCopy } from "./messages/guide";
export type { PrivacyLevelCopy } from "./messages/privacy";
export type { ProviderKeyCopy } from "./messages/providerKeys";
export type { SettingsEntry, SettingsTab } from "./messages/settings";
export type { PlanTierCopy } from "./messages/common";
export type { ConnectorCopy, ModelCopy, RedactionCategoryCopy } from "./messages/catalogCopy";

export interface Messages {
  common: CommonMessages;
  nav: NavMessages;
  billing: BillingMessages;
  /** La PILE AUTO-HÉBERGÉE (Réglages → Versions) — présente seulement dans un build qui
   *  l'honore. La carte, ses quatre champs, ses refus (nommés par le processus privilégié,
   *  jamais inventés ici). */
  selfHost: {
    /** Le nom de l'environnement `custom` là où production/staging ont le leur. */
    envLabel: string;
    envDescription: string;
    eyebrow: string;
    title: string;
    body: string;
    backend: string;
    gateway: string;
    gatewayOptional: string;
    supabaseUrl: string;
    supabaseAnonKey: string;
    apply: string;
    applying: string;
    forget: string;
    /** « Actuellement : api.example.org » — la pile déjà écrite, sous la carte. */
    current: (host: string) => string;
    refusal: {
      backend_required: string;
      not_absolute: string;
      not_https: string;
      userinfo: string;
      query_or_hash: string;
      supabase_pair: string;
      custom_not_allowed: string;
      custom_not_configured: string;
      declined: string;
      write_failed: string;
      generic: string;
    };
  };
  chrome: ChromeMessages;
  shell: ShellMessages;
  sections: SectionsMessages;
  chat: ChatMessages;
  webNav: WebNavMessages;
  composer: ComposerMessages;
  cards: CardsMessages;
  errors: ErrorsMessages;
  agent: AgentMessages;
  availability: AvailabilityMessages;
  connectors: ConnectorsMessages;
  guide: GuideMessages;
  menus: MenusMessages;
  modals: ModalsMessages;
  onboarding: OnboardingMessages;
  providerKeys: ProviderKeysMessages;
  privacyLevels: PrivacyLevelsMessages;
  redactTypes: RedactTypesMessages;
  downloads: DownloadsMessages;
  docViews: DocViewsMessages;
  viewers: ViewersMessages;
  settings: SettingsMessages;
  accountTab: AccountTabMessages;
  privacyTab: PrivacyTabMessages;
  browserTab: BrowserTabMessages;
  modelsTab: ModelsTabMessages;
  billingTab: BillingTabMessages;
  usageTab: UsageTabMessages;
  syncTab: SyncTabMessages;
  orgTab: OrgTabMessages;
  importModal: ImportModalMessages;
  mcpTab: McpTabMessages;
  versionsTab: VersionsTabMessages;
  byo: ByoMessages;
  connectorCatalog: ConnectorCatalogMessages;
  redactionCatalog: RedactionCatalogMessages;
  modelCatalog: ModelCatalogMessages;
  language: LanguageMessages;
}
