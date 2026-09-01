import { attestHeaders } from "./attest";

/**
 * Reading access FLAGS on the relay — outside `sink.ts` because this is
 * NOT telemetry and the gate isn't the same (see `types.ts` `Sink.fetchFlags`).
 *
 * Contract: `POST <relay origin>/flags` with `{ distinct_id }` + a NON-identifying
 * build context, response `{ flags: { key: boolean | variant } }`.
 *
 * ⚠️ Nothing is reported here: the request only carries the anonymous id that serves as the
 * bucketing key. It is therefore **not subject to consent** — declining measurement must
 * not give a different product — nor to the "local host" refusal, which exists to avoid
 * polluting the product's numbers, which a configuration read doesn't do. The only
 * refusal that applies is `setAnalyticsSuspended`: an automated launch must see
 * DETERMINISTIC flags, i.e. the caller's defaults.
 *
 * `null` on anything that isn't a readable response — the caller then keeps its
 * compiled defaults, never "closed".
 */
export interface FlagFetchConfig {
  relayUrl?: string;
  appKey?: string;
  source?: string;
  env?: string;
  /** The TARGETED environment (see `types.ts` `ConfigureOptions.runtimeEnv`) — the only
   *  axis on which a "staging only" targeting tells the truth. */
  runtimeEnv?: string;
  appVersion?: string;
}

export async function fetchRelayFlags(
  cfg: FlagFetchConfig | null,
  distinctId: string,
  log: (kind: string, name: string, extra?: unknown) => void,
): Promise<Record<string, boolean | string> | null> {
  if (!cfg?.relayUrl) return null;
  try {
    // `new URL("flags", ".../e")` replaces the LAST segment: ".../e" → ".../flags".
    // So there is ONE environment variable, not two that could drift apart.
    const url = new URL("flags", cfg.relayUrl).toString();
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await attestHeaders(cfg.appKey)) },
      body: JSON.stringify({
        distinct_id: distinctId,
        source: cfg.source,
        // BOTH: `env` states the build (dev / local / deployed), `runtime_env` the API
        // targeted. A PostHog condition combines them — "staging" to only reach
        // testers, "env ≠ development" to spare dev machines.
        env: cfg.env,
        runtime_env: cfg.runtimeEnv,
        app_version: cfg.appVersion,
      }),
    });
    if (!res.ok) {
      log("error", "flags", `HTTP ${res.status}`);
      return null;
    }
    const body = (await res.json()) as { flags?: unknown };
    if (!body?.flags || typeof body.flags !== "object") return null;
    log("recv", "flags", body.flags);
    return body.flags as Record<string, boolean | string>;
  } catch (e) {
    // Offline, relay down, CSP: the caller keeps its defaults. Never a throw.
    log("error", "flags", String(e));
    return null;
  }
}
