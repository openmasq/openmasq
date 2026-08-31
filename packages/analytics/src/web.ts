/**
 * The skeleton of the WEB surfaces (help center, admin console) set on the same core
 * as the desktop and the extension.
 *
 * ⚠️ The landing used it too, before leaving this monorepo for its own repo
 * (18/08) — it is no longer an OBSERVABLE caller from here, but nothing prevents its
 * new repo from sharing the same shape (even this same package, published).
 *
 * What these sites have in common is not the event vocabulary — it genuinely
 * differs — but the PLUMBING around it: an anonymous id drawn once in
 * `localStorage`, an idempotent configuration, and a `$pageview` deduplicated on
 * the previous URL. Written once per site, it was the same hundred lines
 * repeated (rule 9); written here, the only point of variation left at the call
 * site is what genuinely varies: the vocabulary, the source, and the way
 * the URL is allowed to be published.
 *
 * ⚠️ `urlMode: "path"` is not a cleanliness detail. An application console puts
 * SECRETS in the address bar — `/invite?token=…` is a usable invitation token
 * — and `$current_url` leaves as-is to PostHog. A public site (help,
 * landing) instead wants to keep its query: that's where the UTMs live. Hence an
 * explicit setting, with no implicit default for sensitive surfaces.
 */
import { createAnalytics } from "./createAnalytics";
import type { Analytics, ConfigureOptions } from "./types";

/**
 * The PUBLIC ingestion token of the PostHog project (`phc_…`) — designed to be shipped
 * in a browser, it's not a secret, BUT it identifies ONE specific project:
 * it is therefore no longer committed. Provided by the consuming build's ENV
 * (`OPENMASQ_POSTHOG_KEY`, to be defined/inlined by the calling site's bundler);
 * absent ⇒ empty string ⇒ the core configures no transport and stays silent —
 * never someone else's project. The `typeof process` guard covers a raw
 * browser import, where `process` doesn't exist.
 */
export const OPENMASQ_POSTHOG_KEY: string =
  (typeof process !== "undefined" ? process.env?.OPENMASQ_POSTHOG_KEY : undefined) ?? "";

/** PostHog ingestion — EU cloud (the product's organization). */
export const OPENMASQ_POSTHOG_HOST = "https://eu.i.posthog.com";

/**
 * The keys that `$pageview` is allowed to carry, so the three sites
 * declare them identically in their `ALLOWED` (the sanitize walk drops anything
 * not listed there). A site that adds a dimension extends this list on its own side:
 * `{ $pageview: [...PAGEVIEW_KEYS, "channel"] }`.
 */
export const PAGEVIEW_KEYS = ["$current_url", "$pathname"] as const;

/** The event that `capturePageview` emits. The name and shape are the ones PostHog
 *  expects natively, so it lands in Web Analytics without transformation. */
export interface WebPageview {
  name: "$pageview";
  $current_url?: string;
  $pathname?: string;
}

/** A stable anonymous identifier, randomly drawn and kept in `localStorage`.
 *
 *  This is NOT a tracking cookie: a random UUID, specific to this browser,
 *  with no account behind it and no cross-site correlation — it's used to count
 *  visitors, not to recognize someone. Storage unavailable (locked-down
 *  private browsing, sandboxed iframe) ⇒ `"anon"`, so a degraded count
 *  rather than an exception in a path that must never break the page. */
export function readLocalAnonId(storageKey: string): string {
  try {
    let id = localStorage.getItem(storageKey);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(storageKey, id);
    }
    return id;
  } catch {
    return "anon";
  }
}

export interface WebAnalyticsOptions {
  /** The site's vocabulary (event name → keys kept). */
  allowed: Record<string, readonly string[]>;
  /** envelope `source`: `"docs"` | `"web"` here; `"landing"` remains a
   *  VALID value if the repo extracted from the landing (18/08) calls back into this core. */
  source: string;
  /** The `localStorage` key of the anonymous identifier (one per site — no
   *  cross-site correlation, even on a shared domain). */
  anonKey: string;
  /** Prefix for console diagnostics (event names only). */
  logPrefix?: string;
  /**
   * What `$current_url` is allowed to contain.
   * - `"full"`: the full URL, query included (public sites — the UTMs live there).
   * - `"path"`: origin + path, **query and fragment stripped**. The mode for
   *   application surfaces, where the query carries tokens.
   */
  urlMode: "full" | "path";
  /** The transport. `key` absent AND `relayUrl` absent ⇒ the core configures nothing
   *  and everything becomes a silent no-op: that's the fail-closed reading. */
  config: Pick<
    ConfigureOptions,
    "key" | "apiHost" | "relayUrl" | "debug" | "allowLocalhost" | "env" | "appVersion"
  >;
}

export interface WebAnalytics<E extends { name: string }> {
  /** Configures the transport and turns on baseline measurement. Idempotent, and no effect
   *  outside the browser (server rendering / static build). */
  configure(): void;
  /** A page was viewed → `$pageview`. Deduplicated on the IMMEDIATELY
   *  preceding URL: React StrictMode's double mount (and any re-render) can't
   *  count twice, while a genuine A→B→A round trip still counts. */
  capturePageview(pathname: string, extra?: Record<string, string | number | boolean | undefined>): void;
  /** A site-specific event, passed through the sanitize walk. */
  capture(event: E): void;
  /** The underlying core, for whatever else a site does (the `$exception` channel,
   *  revocable consent…). */
  core: Analytics<E>;
}

/** Composes the shared core and site plumbing into a surface ready to mount. */
export function createWebAnalytics<E extends { name: string }>(
  opts: WebAnalyticsOptions,
): WebAnalytics<E> {
  const core = createAnalytics<E>({
    allowed: opts.allowed,
    getAnonId: () => readLocalAnonId(opts.anonKey),
    defaultSource: opts.source,
    logPrefix: opts.logPrefix,
  });

  let configured = false;
  let lastPageviewUrl = "";

  const currentUrl = (): string => {
    const loc = window.location;
    return opts.urlMode === "path" ? `${loc.origin}${loc.pathname}` : loc.href;
  };

  return {
    core,
    configure(): void {
      if (configured || typeof window === "undefined") return;
      configured = true;
      core.configureAnalytics({ source: opts.source, ...opts.config });
      // Baseline measurement turned on by default, with no cookie or banner: the core
      // already refuses to emit under Do-Not-Track / Global Privacy Control, and nothing
      // identifying travels. A site that adds a more intrusive channel
      // (session replay) asks its own consent for it, like the landing.
      core.setAnalyticsConsent(true);
    },
    capturePageview(pathname, extra): void {
      if (typeof window === "undefined") return;
      const url = currentUrl();
      // The deduplication key is the PUBLISHED URL, not `href`: in `"path"` mode,
      // two visits to the same path with different queries send the same
      // thing, and so have no reason to count twice.
      if (url === lastPageviewUrl) return;
      lastPageviewUrl = url;
      core.captureEvent({
        ...(extra ?? {}),
        name: "$pageview",
        $current_url: url,
        $pathname: pathname,
      } as unknown as E);
    },
    capture(event: E): void {
      core.captureEvent(event);
    },
  };
}
