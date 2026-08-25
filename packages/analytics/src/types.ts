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
   * App-attestation HMAC key, baked into the build. The sink signs each RELAY request
   * with `HMAC-SHA256(appKey, "<ts>.<nonce>")` and sends the attestation headers (`attest.ts`)
   * so the relay can reject traffic that isn't from an official build BEFORE forwarding to
   * PostHog. **Anti-abuse only, NON-IDENTIFYING** — it authenticates the *client build*,
   * NOT a user, so events stay anonymous AND events fire whether or not the user is
   * signed in (this replaced the account-JWT gate, which dropped all pre-login/error
   * events). ⚠️ Honest limit: the key is extractable from a shipped bundle (the
   * extension especially), so it is a bot/drive-by filter, not a wall — rate-limiting is
   * the real flood backstop. Sent ONLY on the relay POST, never the direct-PostHog path.
   * Unset (dev without a baked key) ⇒ no attestation header (the relay accepts it when
   * unconfigured). */
  appKey?: string;
  /**
   * Laisser passer les événements d'une page servie en LOCAL (`localhost`, `127.0.0.1`,
   * `*.local`…). Par défaut `false` : une machine de développement n'alimente pas les
   * chiffres du produit — un `pnpm dev` ouvert toute la journée, un rechargement à chaque
   * sauvegarde, et les rapports comptent le développeur comme une cohorte. Même intention
   * que `setAnalyticsSuspended` pour les lancements automatisés, mais décidée par l'HÔTE,
   * donc sans rien à câbler dans chaque app.
   *
   * ⚠️ Le blocage ne s'applique QUE si l'on voit positivement un hôte de boucle locale : là
   * où il n'y a pas de `location` (rendu serveur, `file://` du bureau empaqueté), on émet.
   * Mettre `true` pour vérifier la chaîne d'ingestion depuis un poste — délibérément, pas
   * par défaut.
   */
  allowLocalhost?: boolean;
  /** Deployment environment stamped on EVERY event's `properties.env`
   *  (`development` | `staging` | `production`). Not sensitive. */
  env?: string;
  /**
   * L'environnement que l'app VISE réellement, quand il peut différer de `env`.
   *
   * ⚠️ Les deux existent parce qu'ils répondent à deux questions différentes, et les
   * confondre se paie des deux côtés. `env` décrit le BUILD : c'est lui qui sépare un
   * `pnpm dev` et un build local d'un déploiement, et tout chiffre produit en dépend —
   * il ne doit pas bouger. `runtimeEnv` décrit l'API à laquelle cette instance PARLE,
   * qui se change à l'exécution depuis l'artefact unique : un binaire de production
   * basculé sur staging annonce toujours `env: "production"`.
   *
   * Seuls les DRAPEAUX le lisent (`flags.ts`), et c'est ce qui rend « fermer une porte
   * en staging seulement » possible : écrit sur `env`, le ciblage raterait exactement
   * les testeurs qu'il vise, et fermerait la porte du parc. Absent ⇒ non transmis, et
   * une condition PostHog qui le nomme ne correspond simplement pas.
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
   * Lire les DRAPEAUX du relais (`POST <origine du relais>/flags`) — la porte ouverte /
   * fermée de certaines sections. `null` quand il n'y a pas de transport, sur une
   * réponse illisible, ou sur la moindre erreur : l'appelant retombe alors sur ses
   * défauts compilés, jamais sur « fermé ».
   *
   * ⚠️ **Ce n'est PAS de la télémétrie, et le gate n'est donc pas le même.** Rien n'est
   * rapporté : la requête ne porte que l'id anonyme qui sert de clé de répartition, et
   * elle N'EST PAS soumise au consentement — refuser la mesure ne doit pas donner un
   * produit différent. Elle reste coupée par `setAnalyticsSuspended` (un lancement
   * automatisé doit voir des drapeaux DÉTERMINISTES, donc les défauts), et elle ignore
   * délibérément le refus « hôte local » : celui-ci existe pour ne pas polluer les
   * chiffres du produit, ce qu'une lecture de configuration ne fait pas.
   */
  fetchFlags(): Promise<Record<string, boolean | string> | null>;
}

/** The full analytics API for one surface. */
export interface Analytics<E extends { name: string }> extends Sink {
  sanitize(event: E): CleanEvent;
  /** The single choke point: `sink(sanitize(event))`. */
  captureEvent(event: E): void;
}
