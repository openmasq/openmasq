import type { Settings } from "../types";

/**
 * Pure (React-free) copy for a redaction-model failure. Kept out of
 * `redaction.tsx` so it's unit-testable and follows the `.ts` = logic rule; the
 * provider/hooks in `redaction.tsx` re-export these for existing import paths.
 *
 * The phrasing depends on the ENGINE, because the two engines fail for different,
 * differently-fixable reasons:
 *  - `model` — a LOCAL model with the user's OWN key / Ollama endpoint. An auth
 *    failure is a missing/invalid key the user sets in Réglages → Confidentialité.
 *  - `remote` — the CLOUD function (Scaleway). Its GPT-OSS key is a SERVER-side
 *    secret the user CANNOT set, so an auth failure is a server-side/config
 *    problem — pointing the user at their settings would be wrong.
 */

/** Coarse cause of a redaction-model failure, inferred from the raw error text. */
export type RedactFailureKind = "auth" | "network" | "unknown";

/** Classify a raw model/endpoint error so the warning can be phrased precisely. */
export function classifyRedactFailure(raw: string): RedactFailureKind {
  // Key/credential problems: missing OR invalid (401/403) — the local model key,
  // OR the cloud function's server-side GPT-OSS key ("… is not set", HTTP 401).
  if (/\b401\b|\b403\b|api[\s_-]?key|unauthor|forbidden|missing key|no api key|not set|invalid.*(key|token|credential)|clé/i.test(raw))
    return "auth";
  // Reachability: network down, DNS, connection refused, timeout, or a 5xx/gateway
  // error from the cloud function (service momentarily unavailable).
  if (/ECONNREFUSED|fetch failed|Failed to fetch|ENOTFOUND|network|timed out|timeout|\b50[234]\b|injoignable|unavailable|bad gateway/i.test(raw))
    return "network";
  return "unknown";
}

/**
 * Whether a redaction failure is something the USER can fix from their own
 * settings. TRUE only for the local `model` engine (their own key / Ollama
 * endpoint). For the `remote` (cloud) engine the model key is a SERVER-side
 * secret, and for the offline `local` (GLiNER) engine a failure is a
 * missing/broken bundled model — neither is fixed from the key settings, so no
 * "Configurer" action should be offered for them.
 */
export function redactFailureIsUserFixable(engine?: Settings["redactEngine"]): boolean {
  return engine !== "remote" && engine !== "local";
}

/**
 * Turn a redaction-model failure into a clear, actionable warning (FR), phrased
 * for the given engine (see the module doc for why the engine matters).
 */
export function describeRedactFailure(raw: string, engine?: Settings["redactEngine"]): string {
  const kind = classifyRedactFailure(raw);
  const unmasked = "les noms/prénoms n'ont pas été masqués";

  // What never gets cut: what was NOT masked, and that nothing was sent. The
  // rest (« contactez le support », « vérifiez votre connexion ») doesn't change the next
  // move, which is « réessayer » (retry) either way.
  if (engine === "remote") {
    if (kind === "auth")
      return `Redaction en ligne indisponible : un souci de notre côté, ${unmasked}. Rien n'a été envoyé — réessayez plus tard, ou contactez le support.`;
    if (kind === "network")
      return `Redaction en ligne injoignable, ${unmasked}. Rien n'a été envoyé — vérifiez votre connexion, puis réessayez.`;
    return `Redaction en ligne indisponible, ${unmasked}. Rien n'a été envoyé — réessayez plus tard. (${raw})`;
  }

  if (engine === "local") {
    // Offline GLiNER engine: no key/endpoint — a failure is a missing/broken
    // bundled model, so point at reinstalling/retrying, not at settings.
    return `Redaction hors ligne indisponible : le modèle de détection n'a pas pu se charger, ${unmasked}. Rien n'a été envoyé — réessayez, puis réinstallez l'app si ça persiste.`;
  }

  // Local `model` engine (or unknown context): the key IS in the user's settings.
  if (kind === "auth")
    return `Redaction indisponible : clé manquante ou invalide, ${unmasked}. Rien n'a été envoyé — renseignez-la dans Réglages → Confidentialité.`;
  if (kind === "network")
    return `Redaction indisponible : modèle injoignable (Ollama démarré ? adresse correcte ?), ${unmasked}. Rien n'a été envoyé.`;
  return `Redaction indisponible, ${unmasked}. Rien n'a été envoyé. (${raw})`;
}
