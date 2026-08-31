import type { Messages } from "@openmasq/i18n";

/**
 * Per-connector official website — the other half of the short "about" block shown at
 * the top of `McpConnectorModal`. Display-only metadata (never secrets); mirrors the
 * side-table shape of `mcpApiKeyHelp.ts`. Keyed by the catalog connector id. Ids absent
 * here simply render no about block (e.g. the local `filesystem` server has no company).
 *
 * The presentation SENTENCE itself lives in the catalogue (`connectors`): it's
 * copy, and it gets translated. What holds the two tables together is the TYPE of the
 * table below — a connector presented with no address, or an address with no
 * presentation, doesn't compile.
 */

export interface ConnectorInfo {
  /** One concise sentence: what the company / product does. */
  about: string;
  /** Official homepage (https). Opened externally from the modal. */
  website: string;
}

const CONNECTOR_WEBSITE: Record<keyof Messages["connectors"], string> = {
  exa: "https://exa.ai",
  tavily: "https://tavily.com",
  firecrawl: "https://firecrawl.dev",
  notion: "https://notion.so",
  airtable: "https://airtable.com",
  superhuman: "https://superhuman.com",
  linear: "https://linear.app",
  atlassian: "https://atlassian.com",
  asana: "https://asana.com",
  fireflies: "https://fireflies.ai",
  monday: "https://monday.com",
  sentry: "https://sentry.io",
  vercel: "https://vercel.com",
  neon: "https://neon.tech",
  supabase: "https://supabase.com",
  semgrep: "https://semgrep.dev",
  stripe: "https://stripe.com",
  paypal: "https://paypal.com",
  square: "https://squareup.com",
  close: "https://close.com",
  intercom: "https://intercom.com",
  attio: "https://attio.com",
  zapier: "https://zapier.com",
  canva: "https://canva.com",
  wix: "https://wix.com",
  webflow: "https://webflow.com",
  dropbox: "https://dropbox.com",
  huggingface: "https://huggingface.co",
  github: "https://github.com",
  "google-calendar": "https://calendar.google.com",
  gmail: "https://mail.google.com",
  "google-drive": "https://drive.google.com",
  slack: "https://slack.com",
  amplitude: "https://amplitude.com",
  posthog: "https://posthog.com",
  apify: "https://apify.com",
  brightdata: "https://brightdata.com",
  cloudflare: "https://cloudflare.com",
  netlify: "https://netlify.com",
  "prisma-postgres": "https://prisma.io",
  cloudinary: "https://cloudinary.com",
  jotform: "https://jotform.com",
  websitepublisher: "https://websitepublisher.ai",
  morningstar: "https://morningstar.com",
  vantage: "https://vantage.sh",
  synapse: "https://synapse.org",
  "google-docs": "https://docs.google.com",
  "google-sheets": "https://sheets.google.com",
  "google-tasks": "https://tasks.google.com",
  "google-analytics": "https://analytics.google.com",
  "microsoft-outlook": "https://outlook.com",
  "microsoft-onedrive": "https://microsoft.com/microsoft-365/onedrive/online-cloud-storage",
  "microsoft-sharepoint": "https://microsoft.com/microsoft-365/sharepoint/collaboration",
  "microsoft-teams": "https://microsoft.com/microsoft-teams",
};

/** A connector's « à propos » card in `t`'s language, or `undefined` if it doesn't
 *  have one (the servers that are OURS: the browser, the local disk). */
export function connectorInfo(id: string, t: Messages): ConnectorInfo | undefined {
  const website = CONNECTOR_WEBSITE[id as keyof Messages["connectors"]];
  return website ? { about: t.connectors[id as keyof Messages["connectors"]], website } : undefined;
}

/** The ids that CARRY a card — read by the parity test against the catalogue. */
export const CONNECTOR_INFO_IDS = Object.keys(CONNECTOR_WEBSITE);
