/**
 * NOTORIOUS service DOMAINS — the DNS spelling of the notoriety dispensation
 * (`./notorious.ts` is the predicate's consumer; same family, same discipline).
 *
 * Why domains need their own list: a transactional sender (`security@updates.linear.app`,
 * `notifications@github.com`) or a bare service domain (`accounts.google.com`) is the
 * SERVICE's identity, never the user's. Faked, it does worse than nothing: the model
 * reasons about a security alert "from" an invented provider, and the fake→real alias the
 * vault records then rewrites every honest occurrence of that domain in the conversation
 * — the exact corruption class the obscure-place pool exists to prevent.
 *
 * ⚠️ ALLOW-list discipline (a wrong entry ships to the model in clear, permanently):
 * - REGISTRABLE domains only — matching is by DNS suffix, so `linear.app` covers
 *   `updates.linear.app`, and an entry therefore blesses every subdomain. Never list a
 *   hosting/user-content apex (`github.io`, `vercel.app`, `web.app`): a user's own site
 *   lives under those.
 * - The email dispensation is DOUBLE-gated: notorious domain AND a service mailbox
 *   local-part. A personal-looking address at a big domain (`jean.dupont@google.com`)
 *   stays redacted — an employee is a person, not the brand.
 * - Both predicates ride the `commercial` notoriety flag at their call sites
 *   (`./notorious.ts`): the Strict level keeps redacting all of it.
 * - No health/finance-sensitive senders beyond what the user's own brand lists already
 *   spare — revealing the SERVICE reveals a relationship; medical ones stay out.
 *
 * Curated SEED like `notoriousData.ts` — extend the sets, keep the discipline.
 */

// Mail PROVIDERS — the domain half of millions of personal addresses. Never identifying
// on its own, and `identity/email.ts` KEEPS it verbatim in a fake under the commercial
// dispensation (swapping `gmail.com` for another real provider is what poisoned the vault).
const PROVIDER_DOMAINS = [
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "hotmail.fr", "live.com",
  "live.fr", "msn.com", "yahoo.com", "yahoo.fr", "ymail.com", "icloud.com", "me.com",
  "mac.com", "proton.me", "protonmail.com", "pm.me", "orange.fr", "wanadoo.fr", "free.fr",
  "laposte.net", "sfr.fr", "neuf.fr", "bbox.fr", "gmx.com", "gmx.fr", "gmx.net", "gmx.de",
  "mail.com", "zoho.com", "aol.com", "fastmail.com", "tutanota.com", "tuta.com", "web.de",
  "t-online.de",
];

// Major SERVICES — the DNS spelling of the brands `notoriousData.ts` already spares,
// MCP-connector brands included (their prose names live in `COMMERCIAL_ORGS`).
const SERVICE_DOMAINS = [
  "google.com", "youtube.com", "android.com", "apple.com", "microsoft.com", "office.com",
  "amazon.com", "amazon.fr", "meta.com", "facebook.com", "facebookmail.com",
  "instagram.com", "whatsapp.com", "linkedin.com", "twitter.com", "x.com", "tiktok.com",
  "pinterest.com", "reddit.com", "redditmail.com", "netflix.com", "spotify.com",
  "discord.com", "twitch.tv", "medium.com", "substack.com",
  "github.com", "gitlab.com", "bitbucket.org", "dropbox.com", "dropboxmail.com",
  "slack.com", "notion.so", "notion.com", "figma.com", "atlassian.com", "atlassian.net",
  "asana.com", "linear.app", "airtable.com", "jotform.com", "intercom.com", "intercom.io",
  "zapier.com", "stripe.com", "paypal.com", "squareup.com", "canva.com", "monday.com",
  "salesforce.com", "hubspot.com", "zoom.us", "sentry.io", "vercel.com", "netlify.com",
  "cloudflare.com", "supabase.com", "posthog.com", "huggingface.co", "cloudinary.com",
  "wix.com", "webflow.com", "scaleway.com", "ovh.com", "ovhcloud.com", "close.com",
  "superhuman.com", "fireflies.ai", "attio.com", "exa.ai", "firecrawl.dev", "apify.com",
  "brightdata.com", "neon.tech", "prisma.io", "semgrep.dev", "amplitude.com",
  "tavily.com", "consensus.app", "alpaca.markets", "daz3d.com", "morningstar.com",
  "interactivebrokers.com", "anthropic.com", "claude.ai", "claude.com", "openai.com",
  "chatgpt.com", "mistral.ai", "docker.com", "npmjs.com", "pypi.org", "mozilla.org",
  "wikipedia.org", "wikimedia.org", "booking.com", "uber.com", "airbnb.com",
  "shopify.com", "ebay.com", "leboncoin.fr",
];

export const NOTORIOUS_DOMAINS: readonly string[] = [...PROVIDER_DOMAINS, ...SERVICE_DOMAINS];
const DOMAIN_SET = new Set(NOTORIOUS_DOMAINS);
/** A bare DNS name — labels only, ≥2 of them. Anything else is prose, not a domain. */
const DOMAIN_SHAPE = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;

/** True when `value` IS a notorious service/provider domain, subdomains included
 *  (`updates.linear.app` → suffix-walk hits `linear.app`). Exact-shape only: a domain
 *  embedded in prose or in a longer identifier never matches. */
export function isNotoriousDomain(value: string): boolean {
  const v = value?.trim().toLowerCase().replace(/\.$/, "");
  if (!v || !DOMAIN_SHAPE.test(v)) return false;
  const parts = v.split(".");
  for (let i = 0; i < parts.length - 1; i++) {
    if (DOMAIN_SET.has(parts.slice(i).join("."))) return true;
  }
  return false;
}

/**
 * Mailbox local-parts that are NOT personal names — the shared vocabulary of the two
 * consumers (rule 9): `identity/email.ts` refuses to derive a NAME alias from them (a
 * fake→"notifications" alias re-redacted the ordinary word conversation-wide), and the
 * service-email dispensation below requires the local-part to be MADE of them.
 * ⚠️ Never add a word that is also a plausible first name — `notoriousDomains.test.ts`
 * pins every entry against the name gazetteer.
 */
export const GENERIC_MAILBOX = new Set([
  "contact", "contactus", "info", "hello", "bonjour", "hey", "support", "admin",
  "administrator", "team", "sales", "noreply", "donotreply", "service", "services",
  "help", "office", "mail", "email", "webmaster", "postmaster", "mailer",
  "billing", "account", "accounts", "jobs", "career", "careers", "press", "marketing",
  "hr", "rh", "compta", "commercial", "direction", "secretariat", "reply",
  "security", "notification", "notifications", "notify", "alert", "alerts", "update",
  "updates", "news", "newsletter", "newsletters", "event", "events", "digest",
  "feedback", "community", "welcome", "invoice", "invoices", "receipt", "receipts",
  "message", "messages", "recommendation", "recommendations", "subscription",
  "subscriptions", "order", "orders", "privacy", "legal", "abuse", "status",
  "stories", "recap", "follow", "suggestions",
]);

/** A TRANSACTIONAL local-part: every token (split on the address separators) is a
 *  generic mailbox word or digits — or the separator-stripped whole is (`no-reply`,
 *  `do.not.reply`). One unknown token ⇒ possibly a person ⇒ not a service mailbox. */
function isServiceMailbox(local: string): boolean {
  const toks = local.toLowerCase().split(/[._+-]+/).filter(Boolean);
  if (!toks.length) return false;
  if (GENERIC_MAILBOX.has(toks.join(""))) return true;
  return toks.every((t) => GENERIC_MAILBOX.has(t) || /^\d+$/.test(t));
}

/** The EMAIL dispensation: a transactional sender at a notorious service domain is the
 *  service's identity, shipped in clear under the `commercial` notoriety flag only
 *  (Strict passes none, and keeps redacting it). Both gates required — see the header. */
export function isNotoriousServiceEmail(email: string, opts?: { commercial?: boolean }): boolean {
  if (opts?.commercial !== true) return false;
  const v = email?.trim();
  const at = v?.lastIndexOf("@") ?? -1;
  if (at <= 0 || at === v.length - 1) return false;
  return isNotoriousDomain(v.slice(at + 1)) && isServiceMailbox(v.slice(0, at));
}
