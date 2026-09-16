/** A sink-ready event: a name + only allow-listed, bucketed primitive props. */
export interface CleanEvent {
  name: string;
  props: Record<string, string | number | boolean | string[]>;
}

/**
 * A crash/failure report for the SEPARATE error-tracking channel (PostHog
 * `$exception`) — kept out of the product-events stream so a bug surfaces on its
 * own. `scope`/`code` are BOUNDED (enum-ish), never free-form; `message` is
 * OPTIONAL and always run through `scrubMessage` before it leaves the machine.
 */
export interface ErrorReport {
  /** Coarse area: "auth" | "redaction" | "mcp" | "inference" | "sync" | "billing"
   *  | "db" | "files" | "updates" | "network" | "uncaught" | "unknown". */
  scope: string;
  /** A bounded reason code (kebab/enum), e.g. "magic-link", "fail-closed". */
  code: string;
  /** Error class name (e.g. "AuthRetryableFetchError") — safe, no data. */
  name?: string;
  /** HTTP status when relevant. */
  status?: number;
  /** True for an unrecoverable/uncaught error. */
  fatal?: boolean;
  /** Optional raw message — SCRUBBED (emails/tokens/ids/digits removed) + truncated. */
  message?: string;
}

/** Per-field numeric quantisers (key → bucket fn). A field with a bucketer has its
 *  numeric value replaced by a coarse range label so an exact count/latency can
 *  never fingerprint a user. Fields without one keep their raw primitive value. */
export type Bucketers = Record<string, (n: number) => string>;

/** Options for {@link createSink}. */
export interface SinkOptions {
  /** The distinct id source: a random local anon id (NO account/PII). Sync (desktop
   *  localStorage) or async (extension chrome.storage) — both are awaited. */
  getAnonId: () => string | Promise<string>;
  /** `source` used when `configureAnalytics` isn't given one (e.g. "extension"). */
  defaultSource?: string;
  /** Diagnostic console prefix (event names/reasons only — never content). */
  logPrefix?: string;
}

/** Options accepted by the returned `configureAnalytics`. */
export interface ConfigureOptions {
  key?: string;
  apiHost?: string;
  relayUrl?: string;
  source?: string;
  debug?: boolean;
  /**
   * The user's session token, as a LAZY provider called on each send to the relay (`null`
   * out of session ⇒ no header). OPTIONAL and not a gate: a valid token gets the event
   * stamped `verified: true`, no token is admitted anonymous — a token proves an account,
   * not which software sends, and requiring it would silence every pre-login event
   * (startup crashes included). Lazy because configuration runs BEFORE the first render.
   * NEVER an identity: `distinct_id` stays the random installation id. */
  getAuthToken?: () => Promise<string | null>;
  /**
   * Let through events from a page served LOCALLY (`localhost`, `127.0.0.1`, `*.local`).
   * Default `false`: a development machine must not feed the product's numbers. The block
   * only applies when a loopback host is positively detected (no `location` ⇒ it emits).
   */
  allowLocalhost?: boolean;
  /** Deployment environment stamped on EVERY event's `properties.env`
   *  (`development` | `staging` | `production`). Not sensitive. */
  env?: string;
  /**
   * The environment the app actually TARGETS, when it can differ from `env`. `env`
   * describes the BUILD and every product figure depends on it; `runtimeEnv` describes the
   * API this instance TALKS to, which can change at runtime. Only the FLAGS read it
   * (`flags.ts`), which is what makes "closing a gate in staging only" possible.
   */
  runtimeEnv?: string;
  /** App version stamped on EVERY event's `properties.app_version`. Not sensitive. */
  appVersion?: string;
  /**
   * How much this build may report. `full` (default) — every declared event and the
   * `$exception` channel. `usage` — ONLY the names in `usageEvents`, and NO `$exception`:
   * a build packaged outside the CI runs code that may differ from any release, so its
   * diagnostics would be read as product facts; its usage is real. The set is the
   * caller's (its vocabulary knows which event is which — `@openmasq/ui` `analytics/tier.ts`),
   * an ALLOW-list: a `usage` tier with no set lets nothing through.
   */
  tier?: "full" | "usage";
  usageEvents?: ReadonlySet<string>;
}

/** The transport half: `{ configureAnalytics, setAnalyticsConsent, sink }`. */
export interface Sink {
  configureAnalytics(opts: ConfigureOptions): void;
  setAnalyticsConsent(on: boolean): void;
  /** Kill switch for a NON-HUMAN launch (e2e / bench driving the built app). Nothing
   *  leaves and the pre-consent queue is dropped, whatever the consent says — an
   *  automated run must never appear in the product's numbers. */
  setAnalyticsSuspended(on: boolean): void;
  sink(event: CleanEvent): void;
  /** Report an error to the SEPARATE error-tracking channel (`$exception`), gated
   *  by the same consent/DNT/transport rules. Anonymised + bounded. */
  captureError(e: ErrorReport): void;
  /**
   * Read the relay's FLAGS — the open/closed gate for certain sections. `null` on any
   * failure: the caller falls back to its compiled defaults, never to "closed".
   * ⚠️ NOT telemetry: nothing is reported, the request carries only the anonymous routing
   * id, and it is NOT subject to consent (refusing measurement must not give a different
   * product). Still cut off by `setAnalyticsSuspended` (an automated launch must see
   * DETERMINISTIC flags) and it ignores the local-host refusal.
   */
  fetchFlags(): Promise<Record<string, boolean | string> | null>;
}

/** The full analytics API for one surface. */
export interface Analytics<E extends { name: string }> extends Sink {
  sanitize(event: E): CleanEvent;
  /** The single choke point: `sink(sanitize(event))`. */
  captureEvent(event: E): void;
}
