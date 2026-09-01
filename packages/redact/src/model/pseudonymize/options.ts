import type { CompleteFn, Detection, Vault } from "../../types";

export interface PseudonymizeOptions {
  /** Optional one-shot model; when present, free-form PII is detected too. */
  complete?: CompleteFn;
  /**
   * Optional LLM-free local detector (GLiNER — see `../local`). When present,
   * free-form PII (names/orgs/places) is detected 100% offline, no completion
   * call. Composed by the caller as `(t) => detectLocalNer(t, predict, …)`;
   * returns the same verbatim `Detection[]` as {@link complete}. Can run in
   * addition to, or instead of, `complete`.
   */
  detectLocal?: (input: string) => Promise<Detection[]>;
  /** Vault (token -> original), mutated in place. Pass the conversation vault. */
  vault?: Vault;
  /**
   * WHAT THE MODEL SEES in place of a sensitive value.
   *
   * - `"fake"` (default) — a believable fake of the same nature (« Marc Charvet »,
   *   an IBAN that passes its own mod-97). The text stays text: the model
   *   agrees, declines, drafts and reasons over values that have the shape of real ones.
   * - `"token"` — an opaque marker (`[PERSON1]`, `[IBAN2]`). Nothing of the value
   *   survives, not even its plausibility: it's the mode with the least RESIDUAL
   *   leak (a fake name stays a name, a fake postal code stays a region),
   *   at the cost of reply quality — see `bench/tokensVsFakes.md`.
   *
   * Reversible in both cases, through the SAME vault: only the key's form changes.
   * The mode is a property of the CONVERSATION, not of the current setting — toggling it
   * mid-stream would leave a vault half fakes, half tokens, hence a history
   * where the model sees both (reversible, but incoherent).
   */
  mode?: "fake" | "token";
  /** Exact strings to always replace (e.g. saved API keys). */
  secrets?: string[];
  /**
   * User-FORCED redactions (composer "Redact" → chosen data type): each exact
   * value is redacted AS `category` (a canonical token — NAME/EMAIL/ORG/…), even if
   * that category is disabled or the value would normally be spared (bare number,
   * URL). `keep` still overrides (the reveal/undo path). Reversible like any span.
   */
  forced?: { value: string; category: string }[];
  /**
   * Replace standalone numbers (quantities/amounts that match no entity) with
   * `n1`, `n2`, … tokens. **OFF by default** — bare numbers are left untouched
   * unless this is explicitly set true, so the AI engine never mangles figures
   * that "mean nothing". Identifying numbers (phone/card/IBAN/postal/…) are still
   * swapped same-kind regardless, because they DO correspond to something.
   */
  numbers?: boolean;
  /** Highlight kinds the user disabled (e.g. ["email"]); those spans are left in clear. */
  disabledKinds?: string[];
  /**
   * value -> kind for spans already in the vault, so disabled categories (and
   * numbers) stop being substituted even when they were learned earlier in the
   * conversation. Without it, fake-data tokens (which carry no category) can't
   * be matched to a disabled kind.
   */
  kinds?: Record<string, string>;
  /**
   * Allow-list: exact values that must NEVER be pseudonymised (case-insensitive)
   * — e.g. the names of the user's CONNECTED integrations ("Stripe", "Canva"),
   * which the chat model needs verbatim to route its tool calls. Drops those
   * spans from BOTH the regex rules and the model detector, and un-applies any
   * matching entry already in the vault (so a value redacted before it was
   * allow-listed is now left in clear).
   */
  keep?: string[];
  /**
   * ALLOW-list of hosts whose URLs are STRUCTURAL — see `RedactOptions.structuralUrlHosts`
   * (same contract, same allow-list discipline). On this path it ALSO feeds the forward
   * vault pass's URL guard, so an already-vaulted value stops rewriting the host and the
   * ids of the links a connector returns.
   */
  structuralUrlHosts?: string[];
  /**
   * UI categories the ORG MANDATES (a member cannot disable OR reveal them). `keep` does
   * NOT win over these (audit): a composer "garder en clair" chip or a reveal must never let
   * an org-forced category egress in clear. Fine categories are mapped to the UI category via
   * `redactionCategory`, so pass the same keys the app forces ON. Empty/absent ⇒ unchanged
   * (`keep` wins over everything, the default).
   */
  unrevealableCategories?: string[];
  /**
   * CONVERSATION-aware collision avoidance. Text blobs (prior message contents…) whose
   * WORDS a newly-minted fake must NOT reuse — so a fake place like "france" is never
   * chosen when the real word "france" already appears elsewhere in the conversation
   * (the "amiens → france, then the user types france" collision that made the real
   * word be re-redacted / reverse-corrupted). The CURRENT `input` is already avoided
   * intrinsically; every existing vault ORIGINAL (a value already seen as real) is
   * added automatically. Best-effort: on total exhaustion the guaranteed-unique
   * suffixed fallback still wins (no leak). Case-insensitive, words ≥3 chars.
   */
  avoid?: string[];
  /**
   * CONTEXT scope for the "never re-fake a fake" guard. When the input is the caller's
   * OWN authored content (a user-typed message), a DETECTED value that equals an existing
   * fake KEY is the user's REAL value — NOT our fake echoed back — so it must get its OWN
   * distinct fake (else it is dropped, sent in CLEAR to the model = a LEAK, and its later
   * reverse maps the user's real word onto the OTHER value = corruption). Set `true` for a
   * user message. Leave FALSE (default) for a TOOL RESULT, where a value equal to a fake IS
   * our fake echoed by the tool/browser and re-faking it would mint compounding identities
   * (the guard this option gates). It bypasses the WHOLE `isExistingFake` guard for authored
   * content — every clause (whole key, multi-word all-keys, fake-company fragment) causes the
   * SAME leak when it fires on the user's genuinely-DETECTED real value, so none is safe to
   * keep for a user message; the anti-compounding purpose only applies to echoed tool output.
   */
  reFakeExisting?: boolean;
  /**
   * Widens the notoriety exemption to COMMERCIAL brands (Google, LVMH, BNP
   * Paribas, and ALL of the app's MCP integrations — `NOTORIOUS_COMMERCIAL_ORGS`).
   * The app passes it based on the protection LEVEL: every level except Strict
   * (`@openmasq/ui` `privacy/privacyLevel.ts` is the policy). Category-scoped
   * like the whole exemption (a private individual named Hermès/Leclerc stays protected) and the
   * « je travaille chez Google » gate (`isSelfBoundEntity`) still wins over it.
   * Absent/false = the 27/07/2026 behaviour: brands redacted.
   */
  commercialNotoriety?: boolean;
  /**
   * OPT-OUT of the PERSONALITIES exemption (`NOTORIOUS_PEOPLE`) — default TRUE
   * (exempt: the historical behaviour of any consumer that passes nothing).
   * The Strict level passes `false`: personalities are then redacted like the
   * rest. Countries and tickers stay exempt regardless of this flag.
   */
  peopleNotoriety?: boolean;
  /**
   * PER-CONVERSATION secret shift for the value→fake mapping. Default 0 = the legacy
   * DETERMINISTIC mapping (a public hash: « Augustin Vaudel » always → « Simon Cros », every
   * conversation, every user — reversible by precomputing the fake pool over a name
   * dictionary). A non-zero salt shifts the mapping per conversation, so the same value maps
   * to a DIFFERENT fake elsewhere and a precomputed public table no longer reverses it.
   * ⚠️ NOT a keyed PRF: the hash is public and the shift additive over 31 bits, so one known
   * (value, fake) pair recovers it by exhaustive search. Stability WITHIN a conversation is the VAULT's job, not this —
   * pass the SAME salt for every send of one conversation. The app generates it with a CSPRNG
   * and persists it on the conversation (`Conversation.redactionSalt`); the engine stays pure
   * and just receives the number. Pinned by `src/model/salt.test.ts`.
   */
  salt?: number;
  /**
   * PER-CONVERSATION KEY (32 bytes, hex) for the value→fake mapping — what `salt` should
   * have been. With it every seed is `HMAC-SHA256(key, category ‖ value)`: a known
   * (value, fake) pair reveals nothing about any other value, which an additive shift over
   * a public hash cannot claim. Absent ⇒ the legacy salted mapping, unchanged, so a
   * conversation minted before keys keeps every fake it already has (the vault holds them;
   * only NEW values use the new construction).
   *
   * The app mints it with a CSPRNG and persists it on `Conversation.redactionKey`; the
   * engine stays pure and just receives the string. Pinned by
   * `src/model/fakes/keyedMapping.test.ts`.
   */
  key?: string;
}
