import type { CompleteFn, Detection, Vault } from "../../types";

export interface PseudonymizeOptions {
  /** Optional one-shot model; when present, free-form PII is detected too. */
  complete?: CompleteFn;
  /** Optional LLM-free local detector (`../local`): free-form PII detected 100% offline.
   *  Returns the same verbatim `Detection[]` as {@link complete}; may run beside it. */
  detectLocal?: (input: string) => Promise<Detection[]>;
  /** Vault (token -> original), mutated in place. Pass the conversation vault. */
  vault?: Vault;
  /**
   * WHAT THE MODEL SEES in place of a sensitive value: `"fake"` (default) a believable
   * fake of the same nature, or `"token"` an opaque marker (`[PERSON1]`) — the least
   * RESIDUAL leak (a fake postal code still names a region) at a reply-quality cost.
   * Reversible in both cases through the SAME vault. A property of the CONVERSATION, not
   * of the current setting: toggling mid-stream leaves a history mixing both forms.
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
  /** Replace standalone numbers with `n1`, `n2`, … tokens. **OFF by default**; identifying
   *  numbers (phone/card/IBAN/postal) are swapped same-kind regardless. */
  numbers?: boolean;
  /** Highlight kinds the user disabled (e.g. ["email"]); those spans are left in clear.
   *  ⚠️ `date` (every non-birth date) is OPT-IN: it runs only when this list is GIVEN and
   *  leaves `date` out — a bare call never masks a plain date (`engine/redact.ts`
   *  `datesEnabled`). */
  disabledKinds?: string[];
  /** value → kind for spans already in the vault, so a disabled category stops being
   *  substituted even when learned earlier (a fake token carries no category itself). */
  kinds?: Record<string, string>;
  /** Allow-list: exact values NEVER pseudonymised (case-insensitive) — the user's
   *  CONNECTED integrations' names, which the model needs verbatim to route tool calls.
   *  Also un-applies a matching entry already in the vault. */
  keep?: string[];
  /**
   * ALLOW-list of hosts whose URLs are STRUCTURAL — see `RedactOptions.structuralUrlHosts`
   * (same contract, same allow-list discipline). On this path it ALSO feeds the forward
   * vault pass's URL guard, so an already-vaulted value stops rewriting the host and the
   * ids of the links a connector returns.
   */
  structuralUrlHosts?: string[];
  /** UI categories the ORG MANDATES (a member cannot disable OR reveal them): `keep` does
   *  NOT win over these. Pass the same keys the app forces ON. Empty ⇒ `keep` wins. */
  unrevealableCategories?: string[];
  /** CONVERSATION-aware collision avoidance: text blobs whose WORDS a newly-minted fake must
   *  NOT reuse, else a fake "france" collides with the real word the user types later and
   *  the global vault re-redacts it. The current `input` and every vault ORIGINAL are
   *  avoided automatically. Best-effort: the suffixed fallback still wins on exhaustion. */
  avoid?: string[];
  /**
   * CONTEXT scope for the "never re-fake a fake" guard. `true` for the caller's OWN authored
   * content: a DETECTED value equal to an existing fake KEY is the user's REAL value and
   * must get its OWN fake (dropped, it goes out in CLEAR and its reverse corrupts the other
   * value). FALSE (default) for a TOOL RESULT, where such a value IS our fake echoed back
   * and re-faking it would compound identities. Bypasses the WHOLE `isExistingFake` guard
   * for authored content — every clause leaks the same way on a genuinely detected value.
   */
  reFakeExisting?: boolean;
  /**
   * Widens the notoriety exemption to COMMERCIAL brands (Google, LVMH, BNP
   * Paribas, and ALL of the app's MCP integrations — `NOTORIOUS_COMMERCIAL_ORGS`).
   * The app passes it based on the protection LEVEL: every level except Strict
   * (`@openmasq/ui` `privacy/privacyLevel.ts` is the policy). Category-scoped
   * like the whole exemption (a private individual named Hermès/Leclerc stays protected) and the
   * « je travaille chez Google » gate (`isSelfBoundEntity`) still wins over it.
   * Absent/false ⇒ brands redacted.
   */
  commercialNotoriety?: boolean;
  /** OPT-OUT of the PERSONALITIES exemption (`NOTORIOUS_PEOPLE`) — default TRUE. Strict
   *  passes `false`. Countries and tickers stay exempt regardless. */
  peopleNotoriety?: boolean;
  /**
   * PER-CONVERSATION secret shift for the value→fake mapping. Default 0 = the legacy
   * DETERMINISTIC mapping (a public hash, reversible by precomputing the pool). A non-zero
   * salt makes the same value map to a DIFFERENT fake elsewhere. ⚠️ NOT a keyed PRF: one
   * known (value, fake) pair recovers it. Pass the SAME salt for every send of one
   * conversation (`Conversation.redactionSalt`). Pinned by `src/model/salt.test.ts`.
   */
  salt?: number;
  /**
   * PER-CONVERSATION KEY (32 bytes, hex): every seed is `HMAC-SHA256(key, category ‖ value)`,
   * so a known (value, fake) pair reveals nothing about any other value. Absent ⇒ the salted
   * mapping, so an older conversation keeps every fake it has (only NEW values use the key).
   * Persisted on `Conversation.redactionKey`. Pinned by `src/model/fakes/keyedMapping.test.ts`.
   */
  key?: string;
}
