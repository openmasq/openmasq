/**
 * The ENGLISH catalogue — a translation of the French source (`fr.ts`).
 *
 * COMPOSÉ de tranches par surface (`en/`) pour tenir le cap 300 LOC (règle 1) —
 * même forme que `packages/emails/i18n/`. `satisfies Messages` valide l'ensemble ; chaque
 * tranche se valide déjà pour sa part, donc une clé oubliée nomme SA tranche.
 */
import type { Messages } from "./messages";
import { chat, chrome, composer } from "./en/chrome";
import { billing, common, nav } from "./en/common";
import { language } from "./en/language";
import { docViews, downloads, menus } from "./en/menus";
import { privacyLevels, redactTypes, webNav } from "./en/privacy";
import { sections } from "./en/sections";
import { settings } from "./en/settings";

const selfHost = {
  envLabel: "Self-hosted",
  envDescription: "Your own stack — the addresses entered below.",
  eyebrow: "SELF-HOSTED STACK",
  title: "Point the app at your own server",
  body: "Enter the addresses of your deployment. The app restarts in a separate profile: nothing from the current environment is copied over. https addresses only.",
  backend: "API (backend)",
  gateway: "Gateway (cloud redaction and included models)",
  gatewayOptional: "Optional",
  supabaseUrl: "Authentication project URL (Supabase)",
  supabaseAnonKey: "Publishable key (Supabase)",
  apply: "Apply and restart",
  applying: "Applying…",
  forget: "Forget this stack",
  current: (host) => `Saved stack: ${host}`,
  refusal: {
    backend_required: "The API address is required.",
    not_absolute: "This address must be complete, starting with https://.",
    not_https: "Only https is accepted (http only towards localhost).",
    userinfo: "An address must not contain credentials.",
    query_or_hash: "An address must contain neither parameters nor a fragment.",
    supabase_pair:
      "The Supabase URL and its publishable key go together: fill in both, or neither.",
    custom_not_allowed: "This version of the app does not allow a self-hosted stack.",
    custom_not_configured: "No stack saved yet: enter it first.",
    declined: "Switch cancelled — nothing changed.",
    write_failed: "The stack could not be saved — nothing changed. Try again.",
    generic: "The switch failed. Try again.",
  },
} satisfies Messages["selfHost"];

export const en = {
  billing,
  chat,
  chrome,
  common,
  composer,
  docViews,
  downloads,
  language,
  menus,
  nav,
  privacyLevels,
  redactTypes,
  sections,
  settings,
  webNav,
  selfHost,
} satisfies Messages;
