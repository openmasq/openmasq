/**
 * The SITES vocabulary — OpenMasq's public web pages, which live outside this repository and
 * post anonymous page views with `source: "site"`. Declared here all the same, because this
 * is the list the relay admits (see `index.ts`).
 *
 * A page view carries what a web-analytics view reads, and nothing that names a person:
 *   • which site and page — `site`, `langue`, the address WITHOUT its query string
 *     (`$current_url`, `$pathname`, `$host`) and the page title;
 *   • where the reader came from — the referring page, also without its query, and the
 *     campaign tags of the address (`utm_*`, ad click ids) when it has them;
 *   • the screen and the browser — sizes, language, and the browser / system / device type
 *     the page reads from its own user agent.
 * No visitor id and no location among the keys: the relay decides the first and derives the
 * second, a page cannot set either.
 */
const PAGEVIEW = [
  "site",
  "langue",
  "$current_url",
  "$host",
  "$pathname",
  "$title",
  "$referrer",
  "$referring_domain",
  "$screen_width",
  "$screen_height",
  "$browser_language",
  "$browser",
  "$browser_version",
  "$os",
  "$device_type",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "gclid",
  "msclkid",
  "fbclid",
] as const;

export const SITE_EVENTS = {
  $pageview: PAGEVIEW,
} as const;
