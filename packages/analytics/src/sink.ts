import type { CleanEvent, ConfigureOptions, ErrorReport, Sink, SinkOptions } from "./types";
import { isOperationalError, MAX_PER_SIGNATURE, REPORTED_ERRORS, scrubMessage } from "./errorTracking";
import { dntEnabled, isLoopbackHost } from "./gates";
import { attestHeaders } from "./attest";
import { fetchRelayFlags } from "./flags";

interface SinkConfig {
  key?: string;
  apiHost: string;
  relayUrl?: string;
  source?: string;
  /** App-attestation HMAC key (baked at build). Signs the RELAY POST only — anti-abuse,
   *  non-identifying: authenticates the client BUILD, not a user, so anonymous + signed-
   *  out events still send. Unset ⇒ no header (relay accepts when unconfigured). */
  appKey?: string;
  /** Laisser passer une page servie en local (voir `isLoopbackHost`). Défaut : non. */
  allowLocalhost?: boolean;
  /** Stamped on every event's `properties.env`. */
  env?: string;
  /** L'environnement VISÉ — lu par les DRAPEAUX seuls, jamais estampillé sur un
   *  événement (voir `types.ts` `ConfigureOptions.runtimeEnv`). */
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

  // ── La FILE d'attente pré-consentement ────────────────────────────────────
  // Le consentement n'est pas connu au démarrage : il arrive avec les réglages, un
  // effet après le montage. Tout ce qui était émis avant était JETÉ en silence — et
  // c'est exactement le cas de `app_open`, dispatché au montage : ZÉRO `app_open` en
  // production pendant que le dev en voyait (StrictMode y rejoue l'effet APRÈS la
  // décision). Un dénominateur manquant rend toute activation/rétention incalculable.
  // On met donc en attente, BORNÉ, jusqu'à ce que la décision tombe : un accord rejoue
  // la file, un refus la jette. **Rien ne part avant la décision** — le gel est ce qui
  // rend l'attente acceptable, pas un contournement du consentement.
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
   *  `extraHeaders` carries the relay's `Authorization` bearer (relay path only). */
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
          // UNE relance sur une panne TRANSITOIRE (réseau, 5xx) — le tir-et-oublie
          // perdait l'événement en silence (audit 13/08). Un 4xx ne se relance pas
          // (le même corps re-produirait le même refus), et une seule relance : un
          // canal de télémétrie ne mérite pas une file durable.
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

  /** Les en-têtes d'attestation du RELAIS — le détail (et pourquoi ce n'est PAS une
   *  identité) vit dans `attest.ts`, désormais partagé avec la lecture des drapeaux. */
  const relayAttestHeaders = (): Promise<Record<string, string>> => attestHeaders(config?.appKey);

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
        appKey: opts.appKey,
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

  /** Mettre en attente jusqu'à la décision de consentement (borné). */
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
    // Un refus JETTE la file — elle n'a jamais quitté la machine.
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
          // its own server-side key (the client ships none in this mode). The attestation
          // HMAC attests the RELAY request only (anti-abuse, non-identifying) — it is NOT
          // part of the envelope, so analytics stays anonymous.
          post(
            cfg.relayUrl,
            { event: event.name, distinct_id, properties: withContext(event.props), source: cfg.source, ts: Date.now() },
            event.name,
            await relayAttestHeaders(),
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
        post(cfg.relayUrl, { event: "$exception", distinct_id, properties: withContext(properties), source: cfg.source, ts: Date.now() }, "$exception", await relayAttestHeaders());
      } else {
        post(`${cfg.apiHost}/capture/`, { api_key: cfg.key, event: "$exception", distinct_id, properties: { ...withContext(properties), $process_person_profile: false } }, "$exception");
      }
    });
    };
    if (!config) return log("skip", "$exception", "no transport");
    if (suspended) return log("skip", "$exception", "suspendu (lancement automatisé)");
    // Une erreur au démarrage (le cas le plus utile) est émise avant la décision de
    // consentement : elle attend comme les autres, elle ne se perd plus.
    if (!consentDecided) return hold(send, "$exception");
    send();
  };

  /** Les drapeaux d'accès (`flags.ts`) — hors du gate de consentement par construction,
   *  mais coupés par la suspension : un lancement automatisé doit voir les défauts. */
  const fetchFlags = async (): Promise<Record<string, boolean | string> | null> => {
    if (suspended) {
      log("skip", "flags", "suspendu (lancement automatisé) → défauts");
      return null;
    }
    return fetchRelayFlags(config, await Promise.resolve(getAnonId()), log);
  };

  return { configureAnalytics, setAnalyticsConsent, setAnalyticsSuspended, sink, captureError, fetchFlags };
}
