/**
 * @openmasq/branding — THE home of brand VALUES (rule 9).
 *
 * `branding.json` (at the root of this package) is the default config file: every
 * brand VALUE that reaches the runtime, the wire, or disk (domains, deep-link
 * scheme, bundle id, support address…) is DERIVED from here, never from a literal. The
 * NAME itself also serves as the technical namespace (npm scope, `OPENMASQ_*` env,
 * `window.openmasq`) since the migration of 24/08/2026 — its mere appearance is no longer
 * a mistake; `check:brand` now guards against the OLD codename's return instead.
 *
 * ⚠️ Many of these values are PERSISTED or ON THE WIRE: localStorage keys
 * (`brandKey("device-id")`), HTTP headers (`brandHeader("sig")`), deep-link scheme,
 * bundle id, domains that the installed base calls. Changing a value in the JSON therefore
 * changes the built product AND breaks compatibility with what's out there — it's a brand
 * decision, not a refactor.
 */
import config from "../branding.json";

export interface BrandConfig {
  /** Product display name (UI, emails, window titles). */
  name: string;
  /** Lowercase token: storage keys, headers, artifact names (`<slug>-jail.exe`). */
  slug: string;
  /** Primary DNS zone — surfaces live on its subdomains (`app.`, `help.`…). */
  domain: string;
  /** Secondary marketing domain. */
  altDomain: string;
  /** Deep-link scheme of the desktop app (`<protocol>://…`). */
  protocol: string;
  /** Bundle identifier of the desktop app (mac/Windows). */
  desktopBundleId: string;
  /** Organization's Sentry host. */
  sentryHost: string;
  /** HuggingFace organization that hosts the pinned model re-exports. */
  hfOrg: string;
  /** Support address shown to the user. */
  supportEmail: string;
  /** Sending zone for transactional emails. */
  mailDomain: string;
}

export const BRAND: BrandConfig = config;

/** `brandHost("app")` → `app.<domain>`; with no argument → the bare domain. */
export const brandHost = (sub?: string): string =>
  sub ? `${sub}.${BRAND.domain}` : BRAND.domain;

/** `brandUrl("app", "/invite")` → `https://app.<domain>/invite`. */
export const brandUrl = (sub?: string, path = ""): string =>
  `https://${brandHost(sub)}${path}`;

/** Slug-prefixed key/name: `brandKey("device-id")` → `<slug>-device-id`. */
export const brandKey = (suffix: string): string => `${BRAND.slug}-${suffix}`;

/** Proprietary HTTP header: `brandHeader("sig")` → `x-<slug>-sig`. */
export const brandHeader = (suffix: string): string => `x-${BRAND.slug}-${suffix}`;
