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
} satisfies Messages;
