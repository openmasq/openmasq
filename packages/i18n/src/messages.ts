/**
 * THE translation CONTRACT — the interface EVERY language implements.
 *
 * This is the heart of the « typed catalogue, no library » choice (see `CLAUDE.md`): a
 * key missing from or extra in `fr.ts`/`en.ts` is a `tsc` error, not a silent
 * runtime fallback. No ICU parser, no runtime loader in a product
 * whose posture is « nothing unverified runs » — interpolation and
 * plurals are typed TypeScript FUNCTIONS, and numbers/dates/currencies go
 * through `Intl` (present in Electron and every browser).
 *
 * ## How to add a key
 *
 * 1. add it to the SLICE that carries it (`messages/`);
 * 2. `tsc` breaks on `fr/` AND `en/` until both have it — that is the point;
 * 3. an entry with a variable is a `(x) => string` function, never a template with holes.
 *
 * ## How to add a LANGUAGE
 *
 * An `xx/` folder whose assembly `satisfies Messages`, added to `MESSAGES` in
 * `locale.ts` and to the `Locale` union. The compiler then demands every key: the door
 * is open, and it refuses an incomplete language.
 *
 * Namespaces follow SURFACES, not files — one word rendered in two
 * places has a single entry (rule 9 applied to copy). This file stays the ONLY
 * list of namespaces; the slices under `messages/` exist only to hold the
 * 300-LOC cap (rule 1), like `packages/emails/i18n/`.
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
import type { ConversationMessages } from "./messages/conversation";
import type { ListsMessages } from "./messages/lists";
import type { TemplatesMessages } from "./messages/templates";
import type {
  LeavesMessages,
  LoginMessages,
  ModelPickerMessages,
  OrgSharesMessages,
} from "./messages/rest";
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
  /** The SELF-HOSTED STACK (Réglages → Versions) — present only in a build that
   *  honours it. The card, its four fields, its refusals (named by the privileged process,
   *  never invented here). */
  selfHost: {
    /** The name of the `custom` environment where production/staging have theirs. */
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
    /** « Actuellement : api.example.org » — the stack already written, under the card. */
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
  lists: ListsMessages;
  templates: TemplatesMessages;
  login: LoginMessages;
  orgShares: OrgSharesMessages;
  modelPicker: ModelPickerMessages;
  leaves: LeavesMessages;
  chat: ChatMessages;
  conversation: ConversationMessages;
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
