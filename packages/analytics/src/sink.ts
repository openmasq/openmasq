import type { CleanEvent, ConfigureOptions, ErrorReport, Sink, SinkOptions } from "./types";
import { isOperationalError, MAX_PER_SIGNATURE, REPORTED_ERRORS, scrubMessage } from "./errorTracking";
import { dntEnabled, isLoopbackHost } from "./gates";
import { fetchRelayFlags } from "./flags";

interface SinkConfig {
  key?: string;
  apiHost: string;
  relayUrl?: string;
  source?: string;
  /** La session Supabase de l'appelant, lue paresseusement à chaque envoi vers le
   *  relais (`types.ts` dit pourquoi paresseuse, et ce que ça coûte hors session). */
  getAuthToken?: () => Promise<string | null>;
  /** Let through a page served locally (see `isLoopbackHost`). Default: no. */
  allowLocalhost?: boolean;
  /** Stamped on every event's `properties.env`. */
  env?: string;
  /** The TARGETED environment — read by FLAGS only, never stamped on an
   *  event (see `types.ts` `ConfigureOptions.runtimeEnv`). */
  runtimeEnv?: string;
  /** Stamped on every event's `properties.app_version`. */
  appVersion?: string;
}

/** Build the transport (relay-or-direct PostHog) with the injected id source. */
export function createSink(options: SinkOptions): Sink {
  const { getAnonId, defaultSource, logPrefix = "[analytics]" } = options;
  let config: SinkConfig | null = null;
  let consent = false;
  let debug = false;

  // ── The pre-consent QUEUE ────────────────────────────────────
  // Consent isn't known at startup: it arrives with the settings, an
  // effect after mount. Everything emitted before that was DROPPED silently — and
  // that's exactly the case for `app_open`, dispatched on mount: ZERO `app_open` in
  // production while dev saw them (StrictMode replays the effect there AFTER the
  // decision). A missing denominator makes any activation/retention uncomputable.
  // So we queue, BOUNDED, until the decision lands: an accept replays
  // the queue, a refusal drops it. **Nothing leaves before the decision** — the freeze is what
  // makes the queueing acceptable, not a bypass of consent.
  const MAX_PENDING = 20;
  let consentDecided = false;
  let suspended = false;
  let pending: (() => void)[] = [];

  const log = (kind: string, name: string, extra?: unknown): void => {
    if (!debug) return;
    // eslint-disable-next-line no-console
    console.info(`${logPrefix} ${kind} · ${name}`, extra ?? "");
  };

  /** POST a body, swallowing every error (analytics must never break the app).
   *  `extraHeaders` porte le `Authorization: Bearer` de la session (chemin relais
   *  uniquement — jamais sur l'envoi direct à PostHog). */
  const post = (
    url: string,
    body: unknown,
    name: string,
    extraHeaders?: Record<string, string>,
    attempt = 0,
  ): void => {
    try {
      void fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...extraHeaders },
        keepalive: true,
        body: JSON.stringify(body),
      })
        .then((r) => {
          // ONE retry on a TRANSIENT failure (network, 5xx) — fire-and-forget
          // silently lost the event (audit 13/08). A 4xx doesn't retry
          // (the same body would reproduce the same refusal), and only one retry: a
          // telemetry channel doesn't deserve a durable queue.
          if (r.ok) return;
          if (r.status >= 500 && attempt === 0) {
            log("retry", name, `HTTP ${r.status} → une relance dans 5 s`);
            setTimeout(() => post(url, body, name, extraHeaders, 1), 5000);
          } else log("error", name, `HTTP ${r.status}`);
        })
        .catch((e) => {
          if (attempt === 0) {
            log("retry", name, `${String(e)} → une relance dans 5 s`);
            setTimeout(() => post(url, body, name, extraHeaders, 1), 5000);
          } else log("error", name, String(e));
        });
    } catch {
      /* never throw */
    }
  };

  /** L'en-tête d'authentification du RELAIS : la session Supabase de l'utilisateur.
   *  Hors session (ou si le fournisseur échoue) → aucun en-tête, et le relais refuse :
   *  l'analytique est authentifiée, et un envoi refusé ne casse jamais l'appelant. */
  const relayAuthHeaders = async (): Promise<Record<string, string>> => {
    try {
      const token = await config?.getAuthToken?.();
      return token ? { Authorization: `Bearer ${token}` } : {};
    } catch {
      return {};
    }
  };

  /** Stamp EVERY event with the build's env + version (non-sensitive context), so PostHog
   *  can slice by environment/version — the dev/staging/prod split the user asked for. */
  const withContext = (props: Record<string, unknown>): Record<string, unknown> => {
    const out: Record<string, unknown> = { ...props };
    if (config?.env) out.env = config.env;
    if (config?.appVersion) out.app_version = config.appVersion;
    return out;
  };

  const configureAnalytics = (opts: ConfigureOptions): void => {
    if (opts.debug != null) debug = opts.debug;
    const relayUrl = opts.relayUrl || undefined;
    const key = opts.key || undefined;
    if (relayUrl || key) {
      config = {
        key,
        apiHost: opts.apiHost ?? "https://eu.i.posthog.com",
        relayUrl,
        source: opts.source ?? defaultSource,
        getAuthToken: opts.getAuthToken,
        allowLocalhost: opts.allowLocalhost,
        env: opts.env,
        runtimeEnv: opts.runtimeEnv,
        appVersion: opts.appVersion,
      };
      log("configured", "analytics", relayUrl ? `relay ${relayUrl}` : `direct ${config.apiHost}`);
    } else {
      config = null;
      log("skip-config", "analytics", "no relay URL and no key → analytics disabled");
    }
  };

  /** Queue until the consent decision (bounded). */
  const hold = (run: () => void, name: string): void => {
    if (pending.length >= MAX_PENDING) return log("skip", name, "file pleine (consentement non tranché)");
    pending.push(run);
    log("hold", name, "consentement pas encore tranché");
  };

  const setAnalyticsConsent = (on: boolean): void => {
    consent = on;
    consentDecided = true;
    const queued = pending;
    pending = [];
    log("consent", on ? "on" : "off", queued.length ? `${queued.length} en attente` : "");
    // A refusal DROPS the queue — it never left the machine.
    if (on) for (const run of queued) run();
  };

  const setAnalyticsSuspended = (on: boolean): void => {
    suspended = on;
    if (on) {
      pending = [];
      log("suspend", "analytics", "lancement automatisé — rien ne partira");
    }
  };

  const sink = (event: CleanEvent): void => {
    const send = (): void => {
      if (suspended) return log("skip", event.name, "suspendu (lancement automatisé)");
      if (!consent) return log("skip", event.name, "consent off");
      if (dntEnabled()) return log("skip", event.name, "Do-Not-Track / GPC enabled");
      if (!config?.allowLocalhost && isLoopbackHost())
        return log("skip", event.name, "hôte local (développement)");
      log("send", event.name, event.props);
      const cfg = config;
      if (!cfg) return;
      void Promise.resolve(getAnonId()).then(async (distinct_id) => {
        if (cfg.relayUrl) {
          // Neutral, sink-agnostic envelope. The relay maps it to PostHog capture with
          // its own server-side key (the client ships none in this mode). Le porteur
          // Supabase authentifie la REQUÊTE et rien d'autre : il ne fait pas partie de
          // l'enveloppe, donc le `distinct_id` reste l'id d'installation anonyme.
          post(
            cfg.relayUrl,
            { event: event.name, distinct_id, properties: withContext(event.props), source: cfg.source, ts: Date.now() },
            event.name,
            await relayAuthHeaders(),
          );
        } else {
          // Direct PostHog ingest (until the relay is deployed).
          post(
            `${cfg.apiHost}/capture/`,
            {
              api_key: cfg.key,
              event: event.name,
              distinct_id,
              properties: { ...withContext(event.props), $process_person_profile: false },
            },
            event.name,
          );
        }
      });
    };
    if (!config) return log("skip", event.name, "no transport (relay URL or key)");
    if (suspended) return log("skip", event.name, "suspendu (lancement automatisé)");
    if (!consentDecided) return hold(send, event.name);
    send();
  };

  /**
   * Error-tracking channel. Builds a PostHog `$exception` event (grouped by
   * `type`/`value` in the Error Tracking product, NOT mixed into product events)
   * and pushes it through the SAME gated `sink`. All fields bounded; the optional
   * message is scrubbed.
   */
  const captureError = (e: ErrorReport): void => {
    // Same gate as `sink` — but its own gated POST so it can send the real
    // `$exception_list` ARRAY (CleanEvent props forbid objects). Anonymised: only
    // bounded scope/code/name/status + a SCRUBBED message.
    const send = (): void => {
    if (suspended) return log("skip", "$exception", "suspendu (lancement automatisé)");
    if (!consent) return log("skip", "$exception", "consent off");
    if (dntEnabled()) return log("skip", "$exception", "Do-Not-Track / GPC enabled");
    if (!config?.allowLocalhost && isLoopbackHost())
      return log("skip", "$exception", "hôte local (développement)");
    // Drop transient/operational failures (offline fetch, token-refresh) — they're
    // not bugs and flooded the channel with non-actionable noise.
    if (isOperationalError(e)) return log("skip", "$exception", "operational/transient");
    const value = e.message ? scrubMessage(e.message) : `${e.scope}: ${e.code}`;
    // Flood cap: report each distinct signature at most a few times per session, so a
    // retry loop can't post the same error hundreds of times. Still keeps the signal.
    const sig = `${e.scope}|${e.code}|${e.name ?? ""}|${value}`;
    const seen = (REPORTED_ERRORS.get(sig) ?? 0) + 1;
    REPORTED_ERRORS.set(sig, seen);
    if (seen > MAX_PER_SIGNATURE) return log("skip", "$exception", "flood-capped");
    const properties: Record<string, unknown> = {
      $exception_list: [{ type: e.name || e.scope, value, mechanism: { handled: !e.fatal, type: "generic" } }],
      scope: e.scope,
      code: e.code,
      fatal: !!e.fatal,
    };
    if (e.name) properties.name = e.name;
    if (typeof e.status === "number") properties.status = e.status;
    log("error", `$exception:${e.scope}`, { code: e.code });
    const cfg = config;
    if (!cfg) return;
    void Promise.resolve(getAnonId()).then(async (distinct_id) => {
      if (cfg.relayUrl) {
        post(cfg.relayUrl, { event: "$exception", distinct_id, properties: withContext(properties), source: cfg.source, ts: Date.now() }, "$exception", await relayAuthHeaders());
      } else {
        post(`${cfg.apiHost}/capture/`, { api_key: cfg.key, event: "$exception", distinct_id, properties: { ...withContext(properties), $process_person_profile: false } }, "$exception");
      }
    });
    };
    if (!config) return log("skip", "$exception", "no transport");
    if (suspended) return log("skip", "$exception", "suspendu (lancement automatisé)");
    // A startup error (the most useful case) is emitted before the consent
    // decision: it waits like the others, it's no longer lost.
    if (!consentDecided) return hold(send, "$exception");
    send();
  };

  /** The access flags (`flags.ts`) — outside the consent gate by construction,
   *  but cut off by suspension: an automated launch must see the defaults. */
  const fetchFlags = async (): Promise<Record<string, boolean | string> | null> => {
    if (suspended) {
      log("skip", "flags", "suspendu (lancement automatisé) → défauts");
      return null;
    }
    return fetchRelayFlags(config, await Promise.resolve(getAnonId()), log);
  };

  return { configureAnalytics, setAnalyticsConsent, setAnalyticsSuspended, sink, captureError, fetchFlags };
}
