import { attestHeaders } from "./attest";

/**
 * La lecture des DRAPEAUX d'accès sur le relais — hors de `sink.ts` parce que ce n'est
 * PAS de la télémétrie et que le gate n'est pas le même (voir `types.ts` `Sink.fetchFlags`).
 *
 * Contrat : `POST <origine du relais>/flags` avec `{ distinct_id }` + un contexte de build
 * NON identifiant, réponse `{ flags: { clé: booléen | variante } }`.
 *
 * ⚠️ Rien n'est rapporté ici : la requête ne porte que l'id anonyme qui sert de clé de
 * répartition. Elle n'est donc **pas soumise au consentement** — refuser la mesure ne doit
 * pas donner un produit différent — ni au refus « hôte local », qui existe pour ne pas
 * polluer les chiffres du produit, ce qu'une lecture de configuration ne fait pas. Le seul
 * refus qui s'applique est `setAnalyticsSuspended` : un lancement automatisé doit voir des
 * drapeaux DÉTERMINISTES, donc les défauts de l'appelant.
 *
 * `null` sur tout ce qui n'est pas une réponse lisible — l'appelant garde alors ses défauts
 * compilés, jamais « fermé ».
 */
export interface FlagFetchConfig {
  relayUrl?: string;
  appKey?: string;
  source?: string;
  env?: string;
  /** L'environnement VISÉ (voir `types.ts` `ConfigureOptions.runtimeEnv`) — le seul
   *  axe sur lequel un ciblage « staging seulement » dit la vérité. */
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
    // `new URL("flags", ".../e")` remplace le DERNIER segment : ".../e" → ".../flags".
    // Une seule variable d'environnement à tenir en phase, pas deux.
    const url = new URL("flags", cfg.relayUrl).toString();
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await attestHeaders(cfg.appKey)) },
      body: JSON.stringify({
        distinct_id: distinctId,
        source: cfg.source,
        // Les DEUX : `env` dit le build (dev / local / déployé), `runtime_env` l'API
        // visée. Une condition PostHog les combine — « staging » pour n'atteindre que
        // les testeurs, « env ≠ development » pour épargner les postes de dev.
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
    // Hors ligne, relais en panne, CSP : l'appelant garde ses défauts. Jamais un throw.
    log("error", "flags", String(e));
    return null;
  }
}
