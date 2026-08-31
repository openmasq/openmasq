import { brandHeader } from "@openmasq/branding";

// Diagnostics helper for rate-limited / unavailable API responses (429 / 503).
// Surfaces the retry timing + quota so a "Trop de requêtes" error carries real,
// actionable detail in the app's Debug Log — not just a bare status.
//
// Sources, in order:
//   • the standard `Retry-After` response header (delta-seconds or HTTP-date),
//   • Google/Gemini's structured body: RetryInfo.retryDelay ("31s") and
//     QuotaFailure.violations (quotaMetric / quotaId / quotaValue).
export function retryAfterHint(res: { headers: Headers; status: number }, body?: string): string {
  const parts: string[] = [];

  const ra = res.headers.get("retry-after");
  if (ra) {
    const t = ra.trim();
    if (/^\d+$/.test(t)) {
      parts.push(`retry-after ${t}s`);
    } else {
      const secs = Math.round((Date.parse(t) - Date.now()) / 1000);
      parts.push(Number.isFinite(secs) ? `retry-after ${Math.max(0, secs)}s` : `retry-after ${t}`);
    }
  }

  if (body) {
    // Gemini embeds the retry delay in the body even when it omits the header.
    const delay = body.match(/"retryDelay"\s*:\s*"([^"]+)"/)?.[1];
    if (delay && !ra) parts.push(`retry-after ${delay}`);
    // Which quota was hit + its limit (QuotaFailure violation).
    const metric = body.match(/"quota(?:Metric|Id)"\s*:\s*"([^"]+)"/)?.[1];
    if (metric) parts.push(`quota ${metric}`);
    const value = body.match(/"quotaValue"\s*:\s*"?(\d+)"?/)?.[1];
    if (value) parts.push(`limit ${value}`);
  }

  return parts.length ? ` [${parts.join(" · ")}]` : "";
}

/**
 * Correlation-id hint for a failed API response, appended to the thrown message so it
 * survives the IPC hop into the app's journal. Sources: the platform gateway
 * (`brandHeader("request-id")` — joins the client failure to the gateway's server-side
 * log of the REAL upstream error), then the provider's own id (OpenAI `x-request-id`,
 * Anthropic `request-id`) for direct calls / support tickets.
 */
export function requestIdHint(res: { headers: Headers }): string {
  const rid =
    res.headers.get(brandHeader("request-id")) ??
    res.headers.get("x-request-id") ??
    res.headers.get("request-id");
  return rid ? ` [req ${rid}]` : "";
}

/**
 * What a 429 ACTUALLY is — a burst to wait out, or a quota that is spent until it
 * resets.
 *
 * The two need opposite handling and the difference is in the response, not a guess.
 * A daily quota was being treated like a burst: six backoff retries (~33 s of dead
 * time) against a limit that does not move before tomorrow, then a message telling the
 * user to « réduire la fréquence » — advice that cannot work on a per-DAY cap. The
 * provider had already said everything: `X-RateLimit-Remaining: 0`, the reset epoch,
 * and a `free-models-per-day` limit source.
 *
 * Parsed from the BODY TEXT alone, deliberately: the typed response dies at the IPC
 * hop, and only the thrown message reaches the renderer — so this same function serves
 * the retry policy (in this package) and the user-facing wording (in the app), instead
 * of two detections that would drift. OpenRouter echoes its own headers into the body,
 * which is what makes that possible.
 */
export interface RateLimitInfo {
  /** A quota spent for a PERIOD (per-day/per-month) — retrying now is pure dead time. */
  daily: boolean;
  /** The spent quota is a FREE tier's, when the body says so (OpenRouter's
   *  `free_tier_daily` / `free-models-per-day` limit sources). The wording keys on
   *  this: « quota gratuit » told to a PAYING key that hit its own daily cap would be
   *  false — periodic does not imply free, and only the body knows. */
  free?: boolean;
  /** The cap that was hit, when stated (e.g. 50 requests). */
  limit?: number;
  /** Epoch MILLISECONDS at which it resets, when stated. */
  resetAt?: number;
  /** How long the refuser asked to wait, when the body states it (the platform gateway
   *  puts `retryAfterMs` in its RATE_LIMITED body). Lets the wording say « ~1 min »
   *  instead of guessing « quelques secondes » at a 60 s window. */
  retryAfterMs?: number;
}

export function rateLimitInfo(body: string): RateLimitInfo {
  const text = body || "";
  const remaining = text.match(/"X-RateLimit-Remaining"\s*:\s*"?(\d+)"?/i)?.[1];
  const rawReset = text.match(/"X-RateLimit-Reset"\s*:\s*"?(\d+)"?/i)?.[1];
  const limit = text.match(/"X-RateLimit-Limit"\s*:\s*"?(\d+)"?/i)?.[1];
  const retryMs = text.match(/"retryAfterMs"\s*:\s*(\d+)/)?.[1];
  // A bare number is ambiguous: providers send epoch SECONDS or MILLISECONDS. Below
  // ~1e12 it cannot be a millisecond epoch of this era, so it is seconds.
  const resetNum = rawReset ? Number(rawReset) : undefined;
  const resetAt =
    resetNum && Number.isFinite(resetNum) ? (resetNum < 1e12 ? resetNum * 1000 : resetNum) : undefined;
  // Either the limit source SAYS it is periodic, or the counter is exhausted and the
  // reset is further out than any backoff could sensibly wait.
  const periodic = /per-?day|per-?month|daily|monthly|free_tier_daily|free-models-per-day/i.test(text);
  const farOff = remaining === "0" && !!resetAt && resetAt - Date.now() > 5 * 60_000;
  return {
    daily: periodic || farOff,
    // Tight on purpose: an incidental "free" in a message must not claim the tier.
    ...(/free[-_]?(tier|models)/i.test(text) ? { free: true } : {}),
    ...(limit ? { limit: Number(limit) } : {}),
    ...(resetAt ? { resetAt } : {}),
    ...(retryMs ? { retryAfterMs: Number(retryMs) } : {}),
  };
}

/**
 * The provider account behind the user's OWN key has no money left — a failure that
 * WEARS a rate-limit's clothes and is neither a burst nor a period:
 *
 *   • OpenAI answers **429 `insufficient_quota`** ("You exceeded your current quota,
 *     please check your plan and billing details") — no `X-RateLimit-*` echo, no
 *     daily/monthly wording, so `rateLimitInfo` reads it as a BURST: the retry loop
 *     spent ~30-60 s of backoff against a refusal that only a payment can move, then
 *     told the user to « patienter quelques secondes ».
 *   • Anthropic answers **400** ("Your credit balance is too low to access the
 *     Anthropic API") — not even a 429, so it fell through to the raw JSON dump.
 *
 * One parse, two consumers (rule 9): the retry policy fails FAST on it, and the app
 * words it as what it is — the key's account needs topping up; no wait will help.
 * Body-text based like everything in this file: only the thrown message survives IPC.
 */
export function providerCreditsExhausted(body: string): boolean {
  // « no credits remaining »: OpenRouter's own wording, observed in prod on
  // 06/08/2026 — a 429 « You have no credits remaining. Add credits… » went through
  // the 7 backoff attempts before being called « limite de débit momentanée ».
  return /insufficient_quota|credit balance is too low|exceeded your current quota|no credits remaining/i.test(
    body || "",
  );
}

/**
 * The quota LEFT, read from a SUCCESSFUL response's headers.
 *
 * The counter is on every reply, not only the refusal — so a limit can be announced
 * while there is still room to act, instead of being discovered at zero after a turn
 * has already been spent. Numbers only: nothing here is content, so it is wire-safe and
 * safe to surface.
 */
export function rateLimitLeft(
  headers?: { get(name: string): string | null },
): { remaining: number; limit?: number; resetAt?: number } | undefined {
  // Absent headers are normal, not exceptional: plenty of endpoints state no quota at
  // all. Reading a counter must never be able to sink a turn that otherwise succeeded.
  const raw = headers?.get("x-ratelimit-remaining");
  if (raw === null) return undefined;
  const remaining = Number(raw);
  if (!Number.isFinite(remaining)) return undefined;
  const limit = Number(headers?.get("x-ratelimit-limit"));
  const reset = Number(headers?.get("x-ratelimit-reset"));
  const resetAt = Number.isFinite(reset) && reset > 0 ? (reset < 1e12 ? reset * 1000 : reset) : undefined;
  return {
    remaining,
    ...(Number.isFinite(limit) && limit > 0 ? { limit } : {}),
    ...(resetAt ? { resetAt } : {}),
  };
}

/**
 * The Error a failed tool request throws — assembled here, beside the hints it composes.
 *
 * Everything it carries exists because the MESSAGE is the only thing that survives the
 * IPC hop into the renderer's journal: the 429 CLASS (a spent quota reads nothing like a
 * burst, and the app words each differently from the same parse), « après N tentatives »
 * (a fail-fast vs an exhausted backoff, at a glance), the retry timing and the
 * correlation id. It states the class and never advises a remedy — the remedy is the
 * app's to word, in the user's language.
 */
export function toolRequestError(
  label: string,
  res: { status: number; headers: Headers },
  body: string,
  attempt: number,
): Error {
  const rl = res.status === 429 ? rateLimitInfo(body) : null;
  // Credits first: an OpenAI insufficient_quota IS a 429, and « limite de débit
  // momentanée » on it would name the wrong class in the journal.
  const hint = providerCreditsExhausted(body)
    ? " — crédits du compte fournisseur épuisés"
    : !rl
      ? ""
      : rl.daily
        ? " — quota du fournisseur épuisé pour la période"
        : " — limite de débit momentanée";
  const tries = attempt > 0 ? ` — après ${attempt + 1} tentatives` : "";
  return new Error(
    `${label} tools request failed (${res.status})${hint}${retryAfterHint(res, body)}${requestIdHint(res)}${tries}: ${body}`,
  );
}
