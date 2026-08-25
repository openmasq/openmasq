// ── Dynamic browser redaction: does THIS call touch conversation data? ───────
// The decision behind the browser's "clear mode": a governed web tool whose call
// carries NO redacted data reads PUBLIC content — its results reach the model
// replay-only (no detection) and the pre-search reveal card has nothing to offer,
// so it is not shown. The moment a call DOES touch redacted data, everything
// reverts to the full path for that call. Kept in the browserPolicy family so the
// whole trust boundary reads as one unit (root rule 10).

import { variantOccurrences } from "@openmasq/redact";

/**
 * True when a web/browse tool call carries conversation-redacted data — i.e. the
 * navigation "uses" sensitive material and must keep the FULL redaction path
 * (reveal card offered, results fully redacted).
 *
 * Two independent signals, either one suffices:
 * 1. **The wire differs from what the model wrote.** The model only ever holds
 *    fakes; if un-redaction changed ANYTHING (a fake token, its URL-encoded
 *    `+`/`%20` forms — the caller passes the args mapped through `wireArg`, the
 *    client's own un-redactor), the dispatched call embeds a vault value.
 * 2. **A sensitive value appears in the wire args** (vault REALS + the Coffre) —
 *    defence in depth for material that reached the args without a token swap.
 *    Same ≥4-chars floor as `analyzeNavExfil`'s vault check, and variant-tolerant
 *    (casing / separators / glued) via `variantOccurrences`.
 *
 * ⚠️ Callers must treat a THROW as `true` (fail closed): this predicate GRANTS a
 * relaxation, so an undecidable call gets the full redaction path, never the
 * clear one. It must also only ever be consulted for a tool positively
 * attributed to the integrated browser or a catalog `search` connector
 * (`isGovernedWebTool`) — a hostile server must not self-classify into
 * clear-mode by naming (`toolExfilScan.test.ts` pins why).
 */
export function navCarriesRedactedData(
  rawArgs: unknown,
  wireArgs: unknown,
  sensitiveValues: readonly string[],
): boolean {
  const raw = JSON.stringify(rawArgs ?? {});
  const wire = JSON.stringify(wireArgs ?? {});
  if (raw !== wire) return true;
  return sensitiveValues.some((v) => {
    const s = v.trim();
    return s.length >= 4 && variantOccurrences(wire, s).length > 0;
  });
}

/**
 * True when a governed web call's args carry a vault value whose CATEGORY the pre-search
 * reveal card can actually offer to reveal. This gates whether the card is SHOWN — a
 * separate, category-AWARE decision from {@link navCarriesRedactedData} (which stays
 * category-blind because it also governs clear-mode: a number is still un-redacted outward
 * and its RESULT still fully redacted; only the CARD is suppressed here).
 *
 * The reveal card only reveals name/dob/address/location/company (`WEBNAV_OFFER_KEYS`), so
 * a query carrying ONLY a number/secret/etc. — e.g. a bare year the number-tokeniser vaulted
 * as `n1` — has nothing the card could reveal, and must NOT interrupt (the reported bug: the
 * redaction dialog popped on a PII-free "ETF 2026" prompt). `offerableValues` is pre-filtered
 * by the caller to the vault reals whose kind maps to an offer category, keeping this module
 * value-shape-only like its siblings. Checks the WIRE args (un-redacted reals): a value the
 * model referenced by fake un-redacts to its real there, and a real it typed verbatim (the
 * year) is already present. ≥4-char floor + variant-tolerant, matching the sibling above.
 */
export function navCarriesOfferableData(
  wireArgs: unknown,
  offerableValues: readonly string[],
): boolean {
  const wire = JSON.stringify(wireArgs ?? {});
  // The wire carries a value URL-ENCODED when the model referenced it by a fake with a space
  // (`Karl%20Studio` / `Karl+Studio`, accents as `%C3%89vreux`). `variantOccurrences` is
  // separator-tolerant but NOT percent/plus-decode-tolerant, and — unlike navCarriesRedactedData,
  // which catches the encoded case via its `raw !== wire` signal — this predicate has only the
  // value check, so scan a DECODED copy too, or an offerable value would be missed and the card
  // wrongly suppressed. Guarded: a malformed `%` sequence falls back to the raw form.
  let decoded = wire;
  try {
    decoded = decodeURIComponent(wire.replace(/\+/g, " "));
  } catch {
    /* keep `wire` */
  }
  return offerableValues.some((v) => {
    const s = v.trim();
    if (s.length < 4) return false;
    return variantOccurrences(decoded, s).length > 0 || variantOccurrences(wire, s).length > 0;
  });
}
