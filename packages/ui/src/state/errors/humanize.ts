import type { Messages } from "@openmasq/i18n";
import type { SendErrorReason } from "../../analytics/events";
import type { Message } from "../../types";
import { PROVIDERS, providerCreditsExhausted, rateLimitInfo, type ProviderId } from "@openmasq/llm";
import { CreditsExhaustedError, MissingApiKeyError, RateLimitError } from "./classes";
import { BRAND } from "@openmasq/branding";
import { subscriptionsSold } from "../../send/platformAccess";

// ── Rules for writing user-facing messages (this file is their home) ──
// 1. ONE message = ONE action. Alternatives are BUTTONS (the card's CTA,
//    the model selector) — re-listing them in prose makes five lines for three
//    visible clicks, and it's the corpus's most mechanical writing tic.
// 2. One em dash per message MAXIMUM; otherwise, a period. The
//    « affirmation — précision » structure repeated everywhere is a signature, not a style.
// 3. No word the user wouldn't use: « interface », « moteur »,
//    « plateforme », « wire » stay in the code. Name things in THEIR world
//    (« votre compte OpenAI », not « le compte de votre clé chez le fournisseur »).
// Privacy promises (« rien n'est parti ») are a product choice:
// they stay — said once, without the « donc » demonstration.

/**
 * Best-effort detection of a rate-limit error. The typed class is LOST across the
 * main↔renderer IPC boundary (a 429 from `@openmasq/llm` arrives as a plain
 * Error), so we also match the serialised message text.
 */
export function isRateLimitError(err: unknown): boolean {
  if (err instanceof RateLimitError) return true;
  const m = err instanceof Error ? err.message : String(err);
  return /\b429\b/.test(m) || /rate[\s_-]?limit/i.test(m);
}

/** A key refused by the provider — present but wrong (typo,
 *  revocation, rotation). Preflight only covers the ABSENT key; this case
 *  used to fall through to the provider's 401 and display as raw English JSON.
 *  Stable strings from the big three: OpenAI (`invalid_api_key` / "Incorrect API key"),
 *  Anthropic (`authentication_error` / "invalid x-api-key"), Google ("API key not
 *  valid"). Deliberately NOT a bare `\b401\b`: a 401 can also be the app's
 *  session on the platform path, which has its own message. */
const INVALID_KEY = /invalid_api_key|incorrect api key|invalid x-api-key|authentication_error|api key not valid/i;

/**
 * Map a raw provider/tool/IPC error string to a friendly FR message when it
 * carries a KNOWN bounded code. Typed error classes are lost across the
 * main↔renderer IPC boundary, and the gateway answers with codes like
 * `CREDITS_EXHAUSTED` (402) / `MODEL_NOT_ALLOWED` (400) — which otherwise reach the
 * user as `Error invoking remote method '…': … {"error":"CREDITS_EXHAUSTED"}`.
 * Returns null when nothing is recognised (the caller keeps its own fallback).
 *
 * `opts.personal` — whether the account is INDIVIDUAL (no org): the gateway's 402
 * names whose budget is exhausted, and « le budget de votre organisation » shown to
 * someone who has no organisation reads as someone else's error. The caller knows
 * (`!orgProfile`); default stays the org wording for compatibility.
 *
 * `opts.provider` — the provider of the model in flight, when the caller knows it.
 * « Votre compte OpenAI n'a plus de crédits » is a sentence; « le compte de votre clé
 * chez le fournisseur » is a periphrase nobody says out loud. Absent, the wording
 * falls back to « chez le fournisseur ».
 */
export function humanizeSendError(
  raw: string,
  t: Messages,
  opts?: { personal?: boolean; provider?: ProviderId },
): string | null {
  const e = t.errors;
  const m = raw || "";
  /** « OpenAI », or null when the caller couldn't say. */
  const name = opts?.provider ? (PROVIDERS[opts.provider]?.label ?? opts.provider) : null;
  const chez = name ? e.atProvider(name) : e.theProvider;
  if (/CREDITS_EXHAUSTED/.test(m)) return new CreditsExhaustedError(opts?.personal ?? false).message;
  if (/CREDITS_UNVERIFIABLE/.test(m)) {
    // Deliberate fail-closed by the gateway (unreadable balance ≠ zero balance): the
    // cause is transient, and « rien n'est parti » is the first question.
    return e.creditsUnverifiable;
  }
  if (/MODEL_NOT_ALLOWED/.test(m)) {
    return e.modelNotAllowed(BRAND.name);
  }
  if (/UPSTREAM_(ERROR|UNAVAILABLE)/.test(m)) {
    // Bounded gateway code — covers a transient upstream blip AND a persistent
    // misconfiguration indistinguishably (the body is deliberately message-free),
    // so don't promise « temporaire » : offer the model switch as the way out.
    return e.upstreamUnavailable(BRAND.name);
  }
  // BEFORE the 429: OpenAI's insufficient_quota IS a 429, and the burst branch used to
  // answer it with « patientez quelques secondes » — wrong about the cause (not a burst), the
  // remedy (only a payment unblocks it) and the timing. Anthropic's 400 « credit balance is
  // too low », meanwhile, used to fall through to the raw JSON. Same parse as the
  // retry policy (`@openmasq/llm`), which fails fast on this case for the same reason.
  if (providerCreditsExhausted(m)) {
    // The actor named, one action, no periphrasis. The key CTA is a BUTTON
    // (`sendErrorAction` → missing_key).
    return name ? e.providerCreditsNamed(name) : e.providerCredits;
  }
  if (INVALID_KEY.test(m)) {
    return name ? e.invalidKeyNamed(name) : e.invalidKey;
  }
  // A 429 used to fall through to the raw provider JSON — a wall of headers and ids
  // where the one thing the user needed (« c'est reparti demain à 2 h ») was buried.
  // The class comes from `@openmasq/llm`'s parse, the SAME one the retry policy reads.
  if (/\b429\b/.test(m) || /rate[\s_-]?limit/i.test(m)) {
    const rl = rateLimitInfo(m);
    if (!rl.daily) {
      // « quelques secondes » is only said when nothing better is known: the gateway
      // puts its window (`retryAfterMs`) in the body, so cite it.
      const wait = rl.retryAfterMs ? formatWait(rl.retryAfterMs, t) : e.someSeconds;
      return e.rateBurst(wait);
    }
    // The TEXT carries the cause and the resume time — « Ça repart demain à 2 h » already
    // says that retrying before then is pointless. The alternatives are BUTTONS (the subscription
    // as a CTA, the model selector under the message): no prose enumeration.
    // « gratuites » only when the BODY says so (`rl.free`): periodic doesn't imply
    // free, and a daily tier on a PAYING key used to show it to someone who pays.
    const when = rl.resetAt ? e.resetsAt(formatReset(rl.resetAt, t)) : "";
    if (rl.free) {
      // The known free sources are daily (free-models-per-day…), so
      // « du jour » is accurate here — it isn't for just any periodic quota.
      const cap = rl.limit ? e.freeCap(rl.limit.toLocaleString(t.common.intlTag)) : e.freeCapPlain;
      return e.dailyExhausted(cap, when);
    }
    return e.quotaExhausted(chez, when);
  }
  if (/MODEL_STALL/.test(m)) {
    // The most FREQUENT cause is still stated — without it, « pas de réponse » points
    // toward no action.
    return e.modelStall;
  }
  return null;
}

/** « ~30 s » / « ~1 min » — a wait announced by the refuser, said in units
 *  read at a glance. Rounded UP: promising less than the window
 *  would make « Réessayer » bounce back a second too early. */
function formatWait(ms: number, t: Messages): string {
  const s = Math.ceil(ms / 1000);
  if (s < 60) return t.errors.waitSeconds(s);
  return t.errors.waitMinutes(Math.ceil(s / 60));
}

/** « demain à 02:00 » / « le 5 août à 02:00 » — a reset the user can plan around, not an
 *  epoch. Same day ⇒ just the hour; tomorrow ⇒ named; beyond ⇒ the date. Exported: the
 *  low-quota warning must word the SAME reset the exhaustion message does (rule 9). */
export function formatReset(at: number, t: Messages): string {
  const intl = t.common.intlTag;
  const d = new Date(at);
  const hh = d.toLocaleTimeString(intl, { hour: "2-digit", minute: "2-digit" });
  const days = Math.round(
    (new Date(d).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86_400_000,
  );
  if (days <= 0) return t.errors.resetToday(hh);
  if (days === 1) return t.errors.resetTomorrow(hh);
  return t.errors.resetOnDate(d.toLocaleDateString(intl, { day: "numeric", month: "long" }), hh);
}

/**
 * Strip the technical noise from an unrecognised error so it's at least readable:
 * drop the Electron `Error invoking remote method '…':` / `Error:` wrappers and
 * collapse a trailing `{"error":"CODE"}` body down to `(CODE)`. Used as the
 * fallback when {@link humanizeSendError} doesn't recognise the error.
 */
export function cleanErrorText(raw: string): string {
  let s = (raw || "").trim();
  s = s.replace(/^Error invoking remote method\s+'[^']*':\s*/i, "");
  s = s.replace(/^Error:\s*/i, "");
  const code = s.match(/\{\s*"error"\s*:\s*"([A-Za-z0-9_]+)"[^}]*\}/);
  if (code) s = s.replace(/:?\s*\{\s*"error"\s*:\s*"[A-Za-z0-9_]+"[^}]*\}\s*$/, ` (${code[1]})`);
  return s.trim() || "Une erreur est survenue.";
}

/**
 * Map a send failure to a BOUNDED analytics reason code (never the raw text).
 *
 * Lives here and not in a view: the agentic loop needs it too, and this is
 * where the 17% of runs that die on the first turn become legible. A second
 * copy on the agent side would have drifted from this one (rule 9).
 */
export function sendErrorReason(e: unknown): SendErrorReason {
  if (e instanceof MissingApiKeyError) return "missing_key";
  // Before the 429: OpenAI's insufficient_quota carries a 429 but is NOT a
  // rate limit — counted as `rate_limit`, it inflated the wrong column; Anthropic's
  // 400, meanwhile, used to count as `bad_request` for a billing problem.
  const rawText = e instanceof Error ? e.message : String(e);
  if (providerCreditsExhausted(rawText)) return "provider_credits";
  if (e instanceof RateLimitError || isRateLimitError(e)) return "rate_limit";
  const t = rawText.toLowerCase();
  if (/401|403|unauthor|forbidden|invalid.*(key|token)|api key/.test(t)) return "auth";
  if (/econnrefused|fetch failed|failed to fetch|enotfound|network|timed out|timeout|socket/.test(t))
    return "network";
  if (/\b5\d\d\b|server error|internal error|bad gateway|unavailable/.test(t)) return "server";
  // Any other 4xx the provider rejected (401/403 already returned "auth" above):
  // a malformed/unsupported request — e.g. a param the model deprecated.
  if (/\b4\d\d\b|invalid.?request|bad request|deprecated|unsupported|not supported|unprocessable/.test(t))
    return "bad_request";
  return "unknown";
}

/**
 * The BUTTON to offer under a failed send, inferred from the provider's raw text.
 *
 * One single home: the simple path and the agentic loop fail in two different
 * functions of `store.ts`, and that is exactly how one of the two ends up with no
 * alternative offered. `undefined` = nothing to offer (« Réessayer » is enough).
 *
 * `provider` — the provider of the model in flight, when the caller knows it: a refused
 * key or an empty provider account get offered the key modal (`missing_key`, the
 * existing plumbing — enter another key then regenerate in place). Without it, text
 * only: a key CTA with no provider wouldn't open anything.
 *
 * ⚠️ The PERIODIC quota is the only one to get the subscription offer. A burst of 429s
 * resolves itself within a few seconds: sticking « prenez un abonnement » on it would sell
 * a solution to a problem that no longer exists.
 */
export function sendErrorAction(raw: string, provider?: ProviderId): Message["errorAction"] | undefined {
  const m = raw || "";
  if (provider && (providerCreditsExhausted(m) || INVALID_KEY.test(m))) {
    return { kind: "missing_key", provider, label: PROVIDERS[provider]?.label ?? provider };
  }
  if (!/\b429\b/.test(m) && !/rate[\s_-]?limit/i.test(m)) return undefined;
  // And only in a build that SELLS (`subscriptionsSold`, off by default): with no
  // subscription to take, an exhausted daily quota has no other way out than waiting.
  return rateLimitInfo(m).daily && subscriptionsSold() ? { kind: "upgrade_plan" } : undefined;
}
