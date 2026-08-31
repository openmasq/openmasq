/**
 * The REDACTION CATEGORY vocabulary — the fine categories, their groups, their display
 * colours and the on/off defaults.
 *
 * It lives HERE, and not in `pages/Settings/`, for the reason already stated for the
 * protection LEVELS next door (`privacyLevel.ts`): the settings page is not its only
 * reader. The conversation's rules modal, the file viewer's kind chips and the privacy
 * report all need the same words, and a `containers/` modal reaching up into `pages/`
 * to get them makes the tier rule false — a leaf then has no reliable place to look.
 * `privacyLevel.ts` itself used to import it from the page, so this folder was not even
 * self-contained.
 *
 * ⚠️ The categories themselves are NOT defined here: `@openmasq/catalog/redaction` is
 * the single source shared with the org admin console (rule 9). This module only names
 * them for the UI and derives their colours from `CATEGORY_HUE` (`@openmasq/redact`).
 * Add a category in the catalog, never here.
 */
import type { ComponentType } from "react";
import { CATEGORY_HUE, type Hue } from "@openmasq/redact";
import {
  REDACTION_CATEGORIES,
  REDACTION_CATEGORY_GROUPS,
  REDACTION_GROUP_TONE,
  CATEGORY_DEFAULTS as CATALOG_CATEGORY_DEFAULTS,
  type CatalogRedactionCategory,
} from "@openmasq/catalog/redaction";
import { UsersIcon, MessageIcon, ActivityIcon, LayersIcon, KeyIcon } from "../components/brand";

/** Category colour → CSS. THE single source is `CATEGORY_HUE` (@openmasq/redact),
 *  so Settings, the privacy report and the chat highlights never drift. */
const hlFg = (h: Hue) => `var(--hl-${h})`;
const hlBg = (h: Hue) => `color-mix(in oklch, var(--hl-${h}) 16%, transparent)`;

/** Privacy report rows — one per fine category, coloured from `CATEGORY_HUE`. The
 *  LABEL is not here: `help/catalogCopy.ts` `privacyKindLabel(key, t)` reads it from the
 *  language catalogue (`redactionCatalog.kinds`). */
const PRIVACY_BASE: { key: keyof typeof CATEGORY_HUE; Icon: ComponentType<{ size?: number }> }[] = [
  { key: "name", Icon: UsersIcon },
  { key: "dob", Icon: ActivityIcon },
  { key: "username", Icon: UsersIcon },
  { key: "email", Icon: MessageIcon },
  { key: "phone", Icon: ActivityIcon },
  { key: "address", Icon: ActivityIcon },
  { key: "location", Icon: ActivityIcon },
  { key: "company", Icon: LayersIcon },
  { key: "card", Icon: KeyIcon },
  { key: "iban", Icon: KeyIcon },
  { key: "national_id", Icon: KeyIcon },
  { key: "ip", Icon: ActivityIcon },
  { key: "number", Icon: ActivityIcon },
  { key: "path", Icon: LayersIcon },
  { key: "secret", Icon: KeyIcon },
  { key: "apikey", Icon: KeyIcon },
];

export const PRIVACY_KINDS: {
  key: string;
  bg: string;
  fg: string;
  Icon: ComponentType<{ size?: number }>;
}[] = PRIVACY_BASE.map((k) => ({
  ...k,
  bg: hlBg(CATEGORY_HUE[k.key]),
  fg: hlFg(CATEGORY_HUE[k.key]),
}));

/**
 * The full catalogue of toggleable redaction categories — the single source of
 * truth is now `@openmasq/catalog` (shared with the org admin console, so the two
 * surfaces never drift). Re-exported here under the historical names the Settings
 * components import (`REDACT_CATEGORIES`, `REDACT_CATEGORY_GROUPS`,
 * `CATEGORY_DEFAULTS`). Grouped for the rules modal; `tone` is the highlight hue
 * for the category dot; `ai:true` = only detected by the model engine (free-form
 * PII), so the modal nudges to enable it. Edit categories in
 * `packages/catalog/src/redaction/index.ts`, not here.
 */
export const REDACT_CATEGORY_GROUPS: string[] = REDACTION_CATEGORY_GROUPS;

export const REDACT_CATEGORIES: CatalogRedactionCategory[] = REDACTION_CATEGORIES;

/** Per-section chip colour (`var(--hl-*)`), keyed by group name. DISTINCT from a
 *  category's `tone`: the rules screen colours by SECTION so each is scannable, while
 *  `tone`/`CATEGORY_HUE` stays the 6-family marker palette used by the highlights. */
export const REDACT_GROUP_TONE: Record<string, string> = REDACTION_GROUP_TONE;

export const CATEGORY_DEFAULTS = CATALOG_CATEGORY_DEFAULTS;
