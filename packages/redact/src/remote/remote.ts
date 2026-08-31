/**
 * Thin client for the remote redaction endpoint (`apps/gateway`, a Scaleway
 * serverless function). It runs the SAME `pseudonymize` engine server-side with
 * GPT-OSS as the semantic-PII detector, so the caller gets model-grade redaction
 * WITHOUT a local redaction-model key or on-device inference — and it stays fully
 * reversible (the vault is returned; unredact locally with it).
 *
 * The endpoint gates every call on a Supabase access token (`Authorization:
 * Bearer <jwt>`, verified via JWKS — no static secret), so the caller must pass
 * the current session token. Used by the desktop store and the extension SW as
 * the optional "remote" redaction engine, with a local-regex fallback on failure.
 */
import { brandUrl } from "@openmasq/branding";
import type { RedactionMatch, Vault } from "../types.js";

/**
 * Built-in endpoint of the deployed gateway/redact-fn (Scaleway). The cloud engine
 * is a paid-plan feature that "just works" — the URL is baked in, NOT something the
 * user configures. Overridable at build via a host's `redactFnUrl`
 * (VITE_REDACT_FN_URL) for staging/self-host, but the app never asks for it.
 * ⚠️ Points at the PROD `gateway.<domain>` custom domain — provision it (the
 * Terraform domains module) before shipping a build that relies on this default.
 * The legacy raw `…scw.cloud` host stays live, so already-shipped builds are unaffected.
 */
export const DEFAULT_REDACT_FN_URL = brandUrl("gateway");

/**
 * Detection models the remote redact-fn is allowed to run, client-selectable.
 * Both are Scaleway **Generative APIs** open-weight models (OpenAI-compatible),
 * so switching is just a different `model` id in the same request shape. This
 * list is the SECURITY allow-list too: the server validates the caller's `model`
 * against it (`isRedactFnModel`) so the public function can't be abused to run an
 * arbitrary model on Scaleway's key. FIRST entry is the default.
 *
 * Pricing (Scaleway, €/M tokens in→out): mistral-small-3.2-24b-instruct-2506
 * 0.15→0.35, gpt-oss-120b 0.15→0.60. FIRST entry = the default: Mistral Small 3.2
 * is a plain INSTRUCT model (returns the detection JSON directly), whereas
 * gpt-oss-120b is a REASONING model that burns the token budget on reasoning
 * before emitting JSON → it under-detected (names/addresses missed). So Mistral is
 * the better default for our structured PII extraction (esp. in French).
 */
export const REDACT_FN_MODELS = [
  { id: "mistral-small-3.2-24b-instruct-2506", label: "Mistral Small 3.2 24B" },
  { id: "gpt-oss-120b", label: "GPT-OSS 120B" },
] as const;

export type RedactFnModel = (typeof REDACT_FN_MODELS)[number]["id"];

/** The default detection model (first in the allow-list). */
export const DEFAULT_REDACT_FN_MODEL: RedactFnModel = REDACT_FN_MODELS[0].id;

/** True when `m` is one of the allow-listed remote redaction models. */
export function isRedactFnModel(m: unknown): m is RedactFnModel {
  return typeof m === "string" && REDACT_FN_MODELS.some((x) => x.id === m);
}

/**
 * The hard ceiling on a single remote-redaction `text`, enforced BY THE SERVER (the
 * gateway 413s past it). Part of the wire CONTRACT, so it lives here and is imported by
 * both sides rather than re-declared (rule 9).
 *
 * ⚠️ This is deliberately NOT the 50k per-FILE cap (`foldPayload`'s `maxFileChars`): the
 * send folds EACH attachment clipped to 50k, so a legitimate multi-document turn is a
 * MULTIPLE of it (3 docs ≈ 150k). Sizing this at 50k would reject real sends. 1M ≈ 20
 * full-size documents — far above any genuine turn, far below the 12 MB body limit that
 * previously bounded an unmetered GPT-OSS call on the app's own key.
 */
export const MAX_REDACT_TEXT_CHARS = 1_000_000;

export interface RemoteRedactInput {
  /** The text to redact. */
  text: string;
  /** Reusable token↔value map; merged + returned so placeholders stay stable. */
  vault?: Vault;
  /** Exact strings to always redact (e.g. the caller's stored API keys). */
  secrets?: string[];
  /** Category ids the caller disabled (e.g. ["email"]); those pass through. */
  disabledKinds?: string[];
  /** Allow-list: exact values that must NEVER be redacted (case-insensitive) —
   *  e.g. the caller's connected integration names ("Stripe", "Canva"). */
  keep?: string[];
  /** User-FORCED redactions: each exact value redacted AS the given canonical
   *  category token (NAME/EMAIL/ORG/…), bypassing the FP-prevention gates. */
  forced?: { value: string; category: string }[];
  /** UI categories the org MANDATES — `keep` must NOT override them (a member can't reveal an
   *  org-forced category). Forwarded; the server ignores it until redeployed (same rollout as
   *  `forced`/`avoid`). */
  unrevealableCategories?: string[];
  /** Conversation-aware collision avoidance: text blobs (prior message contents) whose
   *  WORDS a newly-minted fake must not reuse — so a fake place never collides with a
   *  real word already present in the conversation. Forwarded; the server ignores it
   *  until redeployed (same rollout as `forced`). */
  avoid?: string[];
  /** Context scope for the "never re-fake a fake" guard: `true` for the caller's OWN
   *  authored content (a user message), so a detected value equal to an existing fake is
   *  the user's REAL value and gets its OWN distinct fake instead of leaking. Leave unset
   *  for a TOOL RESULT (the guard stays on — an echoed fake must not compound). Forwarded;
   *  the server ignores it until redeployed (same rollout as `avoid`/`forced`). */
  reFakeExisting?: boolean;
  /** Tokenise standalone numbers (n1, n2, …). OFF by default. */
  numbers?: boolean;
  /** Per-conversation secret salt for the value→fake mapping (0/absent = legacy
   *  deterministic). Forwarded so the SERVER-side pass mints the same secret-keyed,
   *  non-invertible fakes as the client — else server-side redaction stays deterministic
   *  (dictionary-invertible) and its fakes disagree with the client's for the same value.
   *  The server ignores it until redeployed (same rollout as `forced`/`avoid`). */
  salt?: number;
  /** What the model sees: `"fake"` (default) or `"token"` (`[PERSON1]`). Semantics
   *  documented once, in `../model/CLAUDE.md`. The mode is pinned on the
   *  CONVERSATION, so it must ride here too: without it, the "cloud" engine would return
   *  fakes to a conversation in token mode — the same conversation redacted two
   *  different ways depending on the engine chosen. Inert until the server is redeployed (same
   *  rollout as `forced`/`avoid`): it ignores what it doesn't know, so the discrepancy
   *  shows up in the log rather than in a leak. */
  mode?: "fake" | "token";
  /** Widens the notoriety exemption to COMMERCIAL brands (the app's own MCP
   *  integrations included) — see `PseudonymizeOptions.commercialNotoriety` (the app
   *  computes it from the LEVEL: everything except Strict). Forwarded; the server ignores it until
   *  redeployed (same rollout as `forced`/`avoid`) — fail-closed: via the remote
   *  engine the brands just STAY redacted until then. */
  commercialNotoriety?: boolean;
  /** OPT-OUT of the PERSONALITIES exemption (default TRUE = exempt) — the
   *  Strict level passes `false`. ⚠️ Reverse rollout from the field above: as long as the server
   *  isn't redeployed it IGNORES the field and keeps exempting personalities
   *  — a Strict level via the cloud engine therefore leaves them readable until redeployment
   *  (accepted residual, visible in the log; the local engine already redacts them). */
  peopleNotoriety?: boolean;
  /** Skip the GPT-OSS pass; deterministic regex rules only. */
  patternsOnly?: boolean;
  /** Detection model to run server-side (one of REDACT_FN_MODELS). Unset ⇒ the
   *  server default. The server re-validates it against the allow-list. */
  model?: string;
}

export interface RemoteRedactResult {
  /** Text with every secret swapped for a believable same-kind fake. */
  redacted: string;
  /** One entry per distinct secret redacted in this call. */
  matches: RedactionMatch[];
  /** Updated vault (token → original) — keep it to unredact the reply. */
  vault: Vault;
  /** Set when the GPT-OSS pass failed; detection degraded to regex. */
  modelError?: string;
  /** The contract handshake: the options the server actually applied.
   *  ABSENT on a server that predates the handshake — the same signal as a
   *  missing option: the client must decide fail-closed ({@link remoteContractDowngrade}). */
  honored?: string[];
}

/**
 * Did the server IGNORE an option whose being ignored is a LEAK (not a mere
 * cosmetic discrepancy)? Returns the reason to display, or null if the contract holds.
 *
 * The other "forwarded" options each have a safety net (`forced` also riding in
 * `secrets`, the vault that replays…) or degrade in the PROTECTIVE direction (an
 * ignored `commercialNotoriety` redacts more, never less). `peopleNotoriety: false`
 * is the opposite: ignoring it leaves personalities in clear under the Strict label.
 * Every future field whose being ignored leaks gets added HERE — the caller only has one call site.
 */
export function remoteContractDowngrade(
  input: Pick<RemoteRedactInput, "peopleNotoriety">,
  honored: string[] | undefined,
): string | null {
  if (input.peopleNotoriety === false && !honored?.includes("peopleNotoriety")) {
    return "le serveur de redaction n'applique pas encore le niveau Strict aux personnalités (gateway à redéployer)";
  }
  return null;
}

export interface RemoteRedactOptions {
  /** The function URL (POST target). */
  url: string;
  /** Supabase access token for the `Authorization: Bearer` header. */
  token: string;
  /** Abort the request (e.g. a client-side timeout). */
  signal?: AbortSignal;
  /** Override `fetch` (the extension SW / tests inject their own). */
  fetchImpl?: typeof fetch;
}

/**
 * Redact `input.text` via the remote function. Throws on a non-2xx response or a
 * network/timeout error so the caller can fall back to local redaction — NEVER
 * send the raw text on failure.
 */
export async function remoteRedact(
  input: RemoteRedactInput,
  opts: RemoteRedactOptions,
): Promise<RemoteRedactResult> {
  const f = opts.fetchImpl ?? fetch;
  const res = await f(opts.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${opts.token}`,
    },
    body: JSON.stringify({
      text: input.text,
      vault: input.vault,
      secrets: input.secrets,
      disabledKinds: input.disabledKinds,
      keep: input.keep,
      forced: input.forced,
      unrevealableCategories: input.unrevealableCategories,
      avoid: input.avoid,
      reFakeExisting: input.reFakeExisting === true,
      numbers: input.numbers === true,
      salt: input.salt,
      mode: input.mode,
      commercialNotoriety: input.commercialNotoriety === true,
      peopleNotoriety: input.peopleNotoriety !== false,
      patternsOnly: input.patternsOnly === true,
      model: input.model,
    }),
    signal: opts.signal,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`redact-fn ${res.status}: ${detail || res.statusText}`);
  }
  return (await res.json()) as RemoteRedactResult;
}
