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
  /** Ce que le modèle voit : `"fake"` (défaut) ou `"token"` (`[PERSON1]`). Sémantique
   *  documentée une seule fois, dans `../model/CLAUDE.md`. Le mode est épinglé sur la
   *  CONVERSATION, donc il doit rider ici aussi : sans lui, le moteur « cloud » renverrait
   *  des faux à une conversation en mode jetons — la même conversation redacted de deux
   *  façons selon le moteur choisi. Inerte tant que le serveur n'est pas redéployé (même
   *  rollout que `forced`/`avoid`) : il ignore ce qu'il ne connaît pas, donc l'écart se
   *  voit dans le journal plutôt que dans une fuite. */
  mode?: "fake" | "token";
  /** Élargit la dispense de notoriété aux MARQUES commerciales (intégrations MCP de
   *  l'app comprises) — voir `PseudonymizeOptions.commercialNotoriety` (l'app le
   *  calcule du NIVEAU : tout sauf Strict). Forwarded; the server ignores it until
   *  redeployed (same rollout as `forced`/`avoid`) — fail-closed: via the remote
   *  engine the brands just STAY redacted until then. */
  commercialNotoriety?: boolean;
  /** OPT-OUT de la dispense des PERSONNALITÉS (défaut TRUE = dispensées) — le niveau
   *  Strict passe `false`. ⚠️ Rollout inverse du champ ci-dessus : tant que le serveur
   *  n'est pas redéployé il IGNORE le champ et continue de dispenser les personnalités
   *  — un Strict via moteur cloud les laisse donc lisibles jusqu'au redéploiement
   *  (résiduel assumé, visible au journal ; le moteur local les redacted déjà). */
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
  /** Le handshake de contrat : les options que le serveur a réellement appliquées.
   *  ABSENT sur un serveur d'avant le handshake — même signal qu'une option
   *  manquante : le client doit décider fail-closed ({@link remoteContractDowngrade}). */
  honored?: string[];
}

/**
 * Le serveur a-t-il IGNORÉ une option dont l'ignorance est une FUITE (pas un simple
 * écart de forme) ? Retourne la raison à montrer, ou null si le contrat tient.
 *
 * Les autres options « forwarded » ont chacune un filet (les `forced` ridant aussi en
 * `secrets`, le vault qui rejoue…) ou dégradent dans le sens PROTECTEUR (un
 * `commercialNotoriety` ignoré redacted plus, jamais moins). `peopleNotoriety: false`
 * est l'inverse : l'ignorer laisse les personnalités en clair sous l'étiquette Strict.
 * Chaque futur champ dont l'ignorance fuit s'ajoute ICI — le caller n'a qu'un appel.
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
