/**
 * Thin client for the remote redaction endpoint. It runs the SAME `pseudonymize` engine
 * server-side with an LLM as the semantic-PII detector, fully reversible (the vault is
 * returned; unredact locally with it). Every call carries the user's session token as
 * `Authorization: Bearer`. On failure the caller falls back to the local engine — the raw
 * text is never sent.
 */
import { brandUrl } from "@openmasq/branding";
import type { RedactionMatch, Vault } from "../types.js";

/** Built-in endpoint of the remote engine — baked in, not user-configured. A host may
 *  override it at build time (`redactFnUrl`). */
export const DEFAULT_REDACT_FN_URL = brandUrl("gateway");

/**
 * Detection models the remote endpoint may run, client-selectable. This list is also the
 * SECURITY allow-list: the server validates the caller's `model` against it so the public
 * endpoint cannot run an arbitrary model. FIRST entry is the default: a plain INSTRUCT
 * model returns the detection JSON directly, whereas a reasoning model spends the token
 * budget reasoning and under-detects.
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

/** The hard ceiling on a single remote-redaction `text`, enforced BY THE SERVER. Part of
 *  the wire CONTRACT, so it lives here (rule 9). ⚠️ Deliberately NOT the per-FILE cap: a
 *  multi-document turn folds EACH attachment, so a legitimate send is a MULTIPLE of it. */
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
  /** UI categories the org MANDATES — `keep` must NOT override them. */
  unrevealableCategories?: string[];
  /** Text blobs whose WORDS a newly-minted fake must not reuse (collision avoidance). */
  avoid?: string[];
  /** `true` for the caller's OWN authored content (a value equal to an existing fake is the
   *  user's REAL value and gets its own fake); unset for a TOOL RESULT. */
  reFakeExisting?: boolean;
  /** Tokenise standalone numbers (n1, n2, …). OFF by default. */
  numbers?: boolean;
  /** Per-conversation salt for the value→fake mapping, so the server shifts it like the client. */
  salt?: number;
  /** What the model sees: `"fake"` (default) or `"token"`; pinned on the CONVERSATION, so it
   *  rides here too (`../model/CLAUDE.md`). */
  mode?: "fake" | "token";
  /** Widens the notoriety exemption to COMMERCIAL brands (`PseudonymizeOptions.commercialNotoriety`).
   *  Ignored by a server that predates it ⇒ the brands STAY redacted (fail-closed). */
  commercialNotoriety?: boolean;
  /** OPT-OUT of the PERSONALITIES exemption (default TRUE); Strict passes `false`. ⚠️ A
   *  server that ignores it keeps exempting them — the leak direction, hence
   *  {@link remoteContractDowngrade}. */
  peopleNotoriety?: boolean;
  /** Skip the model pass; deterministic regex rules only. */
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
  /** Set when the model pass failed; detection degraded to regex. */
  modelError?: string;
  /** The contract handshake: the options the server actually applied.
   *  ABSENT on a server that predates the handshake — the same signal as a
   *  missing option: the client must decide fail-closed ({@link remoteContractDowngrade}). */
  honored?: string[];
}

/**
 * Did the server IGNORE an option whose being ignored is a LEAK? Returns the reason to
 * display, or null. The other forwarded options degrade in the PROTECTIVE direction;
 * `peopleNotoriety: false` is the opposite. Every future field whose being ignored leaks
 * is added HERE.
 */
export function remoteContractDowngrade(
  input: Pick<RemoteRedactInput, "peopleNotoriety">,
  honored: string[] | undefined,
): string | null {
  if (input.peopleNotoriety === false && !honored?.includes("peopleNotoriety")) {
    return "le serveur de redaction n'applique pas encore le niveau Strict aux personnalités";
  }
  return null;
}

export interface RemoteRedactOptions {
  /** The function URL (POST target). */
  url: string;
  /** Session token for the `Authorization: Bearer` header. */
  token: string;
  /** Abort the request (e.g. a client-side timeout). */
  signal?: AbortSignal;
  /** Override `fetch` (the extension SW / tests inject their own). */
  fetchImpl?: typeof fetch;
}

/** Redact `input.text` remotely. Throws on a non-2xx or a network error so the caller
 *  falls back to local redaction — NEVER send the raw text on failure. */
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
