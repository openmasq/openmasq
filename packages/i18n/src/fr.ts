/**
 * The FRENCH catalogue — the SOURCE language (the code is written in French, and the
 * most worked-on messages — refusals, `redact` — are written here first).
 *
 * COMPOSED of per-surface slices (`fr/`) to hold the 300-LOC cap (rule 1) —
 * same shape as `packages/emails/i18n/`. `satisfies Messages` validates the whole; each
 * slice already validates its own part, so a forgotten key names ITS slice.
 */
import type { Messages } from "./messages";
import { agent } from "./fr/agent";
import { availability } from "./fr/availability";
import { cards } from "./fr/cards";
import { connectorCatalog } from "./fr/connectorCatalog";
import { modelCatalog } from "./fr/modelCatalog";
import { redactionCatalog } from "./fr/redactionCatalog";
import { chat, chrome, composer } from "./fr/chrome";
import { connectors } from "./fr/connectors";
import { billing, common, nav } from "./fr/common";
import { language } from "./fr/language";
import { errors } from "./fr/errors";
import { guide } from "./fr/guide";
import { docViews, downloads, menus } from "./fr/menus";
import { mcpTab } from "./fr/mcpTab";
import { versionsTab } from "./fr/versionsTab";
import { byo } from "./fr/byo";
import { modals } from "./fr/modals";
import { onboarding } from "./fr/onboarding";
import { providerKeys } from "./fr/providerKeys";
import { privacyLevels, redactTypes, webNav } from "./fr/privacy";
import { sections } from "./fr/sections";
import { conversation } from "./fr/conversation";
import { leaves, login, modelPicker, orgShares } from "./fr/rest";
import { lists } from "./fr/lists";
import { templates } from "./fr/templates";
import { shell } from "./fr/shell";
import { viewers } from "./fr/viewers";
import { settings } from "./fr/settings";
import { accountTab, browserTab, modelsTab, privacyTab } from "./fr/settingsTabs";
import { billingTab, importModal, orgTab, syncTab, usageTab } from "./fr/settingsMore";

const selfHost = {
  envLabel: "Auto-hébergé",
  envDescription: "Votre propre pile — les adresses saisies ci-dessous.",
  eyebrow: "PILE AUTO-HÉBERGÉE",
  title: "Pointer l'application vers votre propre serveur",
  body: "Renseignez les adresses de votre déploiement. L'application redémarre dans un profil séparé : rien de l'environnement actuel n'y est copié. Adresses en https uniquement.",
  backend: "API (backend)",
  gateway: "Passerelle (redaction cloud et modèles inclus)",
  gatewayOptional: "Facultatif",
  supabaseUrl: "URL du projet d'authentification (Supabase)",
  supabaseAnonKey: "Clé publiable (Supabase)",
  apply: "Appliquer et redémarrer",
  applying: "Application…",
  forget: "Oublier cette pile",
  current: (host) => `Pile enregistrée : ${host}`,
  refusal: {
    backend_required: "L'adresse de l'API est obligatoire.",
    not_absolute: "Cette adresse doit être complète, en commençant par https://.",
    not_https: "Seul https est accepté (http uniquement vers localhost).",
    userinfo: "Une adresse ne doit pas contenir d'identifiants.",
    query_or_hash: "Une adresse ne doit contenir ni paramètres ni fragment.",
    supabase_pair:
      "L'URL Supabase et sa clé publiable vont ensemble : renseignez les deux, ou aucune.",
    custom_not_allowed: "Cette version de l'application n'autorise pas de pile auto-hébergée.",
    custom_not_configured: "Aucune pile enregistrée : renseignez-la d'abord.",
    declined: "Bascule annulée — rien n'a changé.",
    write_failed: "La pile n'a pas pu être enregistrée — rien n'a changé. Réessayez.",
    generic: "La bascule a échoué. Réessayez.",
  },
} satisfies Messages["selfHost"];

export const fr = {
  agent,
  availability,
  billing,
  cards,
  chat,
  chrome,
  conversation,
  lists,
  templates,
  login,
  orgShares,
  modelPicker,
  leaves,
  shell,
  viewers,
  common,
  composer,
  connectors,
  docViews,
  downloads,
  errors,
  guide,
  language,
  menus,
  modals,
  nav,
  onboarding,
  providerKeys,
  privacyLevels,
  redactTypes,
  sections,
  settings,
  accountTab,
  privacyTab,
  browserTab,
  modelsTab,
  billingTab,
  usageTab,
  syncTab,
  orgTab,
  importModal,
  mcpTab,
  versionsTab,
  byo,
  connectorCatalog,
  redactionCatalog,
  modelCatalog,
  webNav,
  selfHost,
} satisfies Messages;
