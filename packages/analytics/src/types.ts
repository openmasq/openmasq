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
   * La session **Supabase** de l'utilisateur — un fournisseur PARESSEUX, appelé à chaque
   * envoi vers le relais, qui rend le jeton d'accès courant (ou `null` hors session).
   * Le sink pose alors `Authorization: Bearer <jwt>`, et le relais le vérifie contre le
   * JWKS du projet (`apps/analytics-fn`).
   *
   * Il remplace (01/09/2026) l'attestation HMAC maison, dont la clé était bakée dans un
   * bundle expédié — donc extractible, et le dépôt le disait : « un filtre à robots, pas
   * un mur ». Une session est une vraie authentification : révocable, expirante, propre
   * à une personne.
   *
   * ⚠️ Paresseux, et pas une valeur, parce que la configuration se fait AVANT le premier
   * rendu, quand aucune session n'existe encore. `null` ⇒ aucun en-tête : la requête part
   * quand même et le relais la refuse (401) — l'envoi est « tire et oublie », un événement
   * refusé ne casse jamais l'appelant.
   *
   * ⚠️ CE QUE ÇA COÛTE : hors session, plus rien n'est mesuré — y compris les plantages
   * de démarrage. C'est le prix assumé d'une analytique authentifiée. */
  getAuthToken?: () => Promise<string | null>;
  /**
   * Let through events from a page served LOCALLY (`localhost`, `127.0.0.1`,
   * `*.local`…). Default `false`: a development machine shouldn't feed the
   * product's numbers — a `pnpm dev` left open all day, a reload on every
   * save, and reports would count the developer as a cohort. Same intent
   * as `setAnalyticsSuspended` for automated launches, but decided by the HOST,
   * so nothing to wire in each app.
   *
   * ⚠️ The block ONLY applies if a local-loopback host is positively detected: where
   * there's no `location` (server rendering, the packaged desktop's `file://`), it emits.
   * Set `true` to verify the ingestion chain from a workstation — deliberately, not
   * by default.
   */
  allowLocalhost?: boolean;
  /** Deployment environment stamped on EVERY event's `properties.env`
   *  (`development` | `staging` | `production`). Not sensitive. */
  env?: string;
  /**
   * The environment the app actually TARGETS, when it can differ from `env`.
   *
   * ⚠️ Both exist because they answer two different questions, and conflating
   * them costs on both sides. `env` describes the BUILD: it's what separates a
   * `pnpm dev` and a local build from a deployment, and every product figure depends on it —
   * it must not move. `runtimeEnv` describes the API this instance TALKS to,
   * which changes at runtime from the single artifact: a production binary
   * switched to staging still announces `env: "production"`.
   *
   * Only the FLAGS read it (`flags.ts`), and that's what makes "closing a gate
   * in staging only" possible: written on `env`, the targeting would miss exactly
   * the testers it's aimed at, and would close the gate for the whole fleet. Absent ⇒ not sent, and
   * a PostHog condition naming it simply won't match.
   */
  runtimeEnv?: string;
  /** App version stamped on EVERY event's `properties.app_version`. Not sensitive. */
  appVersion?: string;
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
   * Read the relay's FLAGS (`POST <relay origin>/flags`) — the open/closed
   * gate for certain sections. `null` when there's no transport, on an
   * unreadable response, or on any error whatsoever: the caller then falls back to its
   * compiled defaults, never to "closed".
   *
   * ⚠️ **This is NOT telemetry, and so the gate isn't the same.** Nothing is
   * reported: the request only carries the anonymous id used as a routing key, and
   * it is NOT subject to consent — refusing measurement must not give a
   * different product. It stays cut off by `setAnalyticsSuspended` (an
   * automated launch must see DETERMINISTIC flags, hence the defaults), and it
   * deliberately ignores the "local host" refusal: that one exists to avoid polluting the
   * product's numbers, which a configuration read doesn't do.
   */
  fetchFlags(): Promise<Record<string, boolean | string> | null>;
}

/** The full analytics API for one surface. */
export interface Analytics<E extends { name: string }> extends Sink {
  sanitize(event: E): CleanEvent;
  /** The single choke point: `sink(sanitize(event))`. */
  captureEvent(event: E): void;
}
