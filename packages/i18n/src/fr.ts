/**
 * Le catalogue FRANÇAIS — la langue SOURCE (le code est écrit en français, et les
 * messages les plus travaillés — refus, `redact` — s'écrivent d'abord ici).
 *
 * COMPOSÉ de tranches par surface (`fr/`) pour tenir le cap 300 LOC (règle 1) —
 * même forme que `packages/emails/i18n/`. `satisfies Messages` valide l'ensemble ; chaque
 * tranche se valide déjà pour sa part, donc une clé oubliée nomme SA tranche.
 */
import type { Messages } from "./messages";
import { chat, chrome, composer } from "./fr/chrome";
import { billing, common, nav } from "./fr/common";
import { language } from "./fr/language";
import { docViews, downloads, menus } from "./fr/menus";
import { privacyLevels, redactTypes, webNav } from "./fr/privacy";
import { sections } from "./fr/sections";
import { settings } from "./fr/settings";

export const fr = {
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
