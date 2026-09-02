
/**
 * Reading access FLAGS on the relay — outside `sink.ts` because this is
 * NOT telemetry and the gate isn't the same (see `types.ts` `Sink.fetchFlags`).
 *
 * Contract: `POST <relay origin>/flags` with `{ distinct_id }` + a NON-identifying
 * build context, response `{ flags: { key: boolean | variant } }`.
 *
 * ⚠️ **No measurement is reported here, but the request is not anonymous — state it
 * plainly rather than let the word do work it can't.** It carries the stable install id
 * (the bucketing key), the build context, the source IP, and — because the relay refuses
 * an unauthenticated read — the signed-in account's bearer token. A configuration read is
 * therefore an identified one, and the relay operator can see which install asked and
 * when.
 *
 * It is **not subject to consent** all the same, and that is a deliberate trade, not an
 * oversight: declining measurement must not give a different product, and a flag read is
 * what decides which product you get. The same reasoning exempts it from the "local host"
 * refusal, which exists to keep dev traffic out of the product's numbers — a configuration
 * read adds nothing to those numbers. The only refusal that applies is
 * `setAnalyticsSuspended`: an automated launch must see DETERMINISTIC flags, i.e. the
 * caller's defaults. Anyone who wants none of it ships with the relay variable empty,
 * which is the documented opt-out for every channel in `README.md`.
 *
 * `null` on anything that isn't a readable response — the caller then keeps its
 * compiled defaults, never "closed".
 */
export interface FlagFetchConfig {
  relayUrl?: string;
  getAuthToken?: () => Promise<string | null>;
  source?: string;
  env?: string;
  /** The TARGETED environment (see `types.ts` `ConfigureOptions.runtimeEnv`) — the only
   *  axis on which a "staging only" targeting tells the truth. */
  runtimeEnv?: string;
  appVersion?: string;
}

/** L'en-tête d'authentification du relais : la session Supabase de l'appelant.
 *  Hors session (ou si le fournisseur échoue) → aucun en-tête, et le relais refuse.
 *  ⚠️ Type de retour EXPLICITE : sans lui, TypeScript infère une union
 *  `{ Authorization?: undefined }` que `HeadersInit` refuse (TS2769). */
async function authHeaders(cfg: FlagFetchConfig): Promise<Record<string, string>> {
  try {
    const token = await cfg.getAuthToken?.();
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
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
      headers: { "Content-Type": "application/json", ...(await authHeaders(cfg)) },
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
