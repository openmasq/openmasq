import type {
  RedactionMatch,
  RedactionResult,
  RedactionType,
  RedactOptions,
} from "../types";
import { redactionCategory, URL_EXEMPT_KINDS } from "../kinds";
import { escapeRegExp, keepSet, isKept } from "../util";
import { LABELS, RULES } from "./rules";
import { longestValidPrefix } from "./validators";
import { makeAllocator } from "./allocator";
import { detectPhones } from "./phones";
import { detectHostedUrlSpans, detectUrlSpans, occursOutsideUrl } from "./urls";

/**
 * Redact sensitive data from `input`. With a {@link Vault}, placeholders are
 * stable across calls and the vault is updated so the result is reversible.
 */
export function redact(
  input: string,
  options: RedactOptions = {},
): RedactionResult {
  const vault = options.vault ?? {};
  const alloc = makeAllocator(vault);
  const keep = keepSet(options.keep);

  const matches: RedactionMatch[] = [];
  const seen = new Set<string>();

  const ensure = (type: RedactionType, value: string): string => {
    const placeholder = alloc.ensure(LABELS[type], value);
    if (!seen.has(placeholder)) {
      seen.add(placeholder);
      matches.push({ type, value, placeholder });
    }
    return placeholder;
  };

  let text = input;

  // 1) Exact known secrets first (longest first so a key isn't partly matched).
  const secrets = (options.secrets ?? [])
    .map((s) => s.trim())
    .filter((s) => s.length >= 4 && !isKept(s, keep))
    .sort((a, b) => b.length - a.length);
  for (const secret of secrets) {
    const pattern = new RegExp(escapeRegExp(secret), "g");
    text = text.replace(pattern, () => ensure("secret", secret));
  }

  // 2) Pattern rules (skip categories the user disabled). A rule with a
  //    `validate` (card/IBAN) only fires when its checksum confirms the match.
  //    A match on the `keep` allow-list is left in clear.
  const disabled = new Set(options.disabledKinds ?? []);
  // `url` category OFF (the default) ⇒ leave URLs and EVERY sub-part in clear: drop any
  // value whose occurrences all sit inside a URL span (image filenames, CDN cache-
  // busters, query tokens). Computed on the ORIGINAL input (value-based, so it's immune
  // to the position shifts as rules rewrite `text`).
  // `null` when the category is on OR the text has NO URL (the common case): the
  // per-candidate scan below is then skipped entirely, so a big URL-free log isn't
  // slowed by an O(candidates × length) check.
  // …and INDEPENDENTLY of that toggle, the URLs addressing a CONNECTED integration's own
  // host (`structuralUrlHosts` — an ALLOW-list, see `detectHostedUrlSpans`): a Notion page
  // id or a `?pvs=1` is that service's addressing, so redacting it only hands the model a
  // dead link it cannot feed back to the connector. Values that ALSO occur outside such a
  // URL (a person's name in a slug AND in the page title) are untouched by this — the gate
  // is per-value — and `URL_EXEMPT_KINDS` still wins over both spans.
  const urlSpansRaw = [
    ...(disabled.has("url") ? detectUrlSpans(input) : []),
    ...detectHostedUrlSpans(input, options.structuralUrlHosts ?? []),
  ];
  const urlSpans = urlSpansRaw.length ? urlSpansRaw : null;
  const inUrlOnly = (v: string): boolean =>
    urlSpans !== null && !occursOutsideUrl(v, input, urlSpans);
  for (const rule of RULES) {
    const cat = redactionCategory(rule.type);
    if (disabled.has(cat)) continue;
    // A gated rule whose keyword appears nowhere is skipped whole — its lookbehind
    // is what priced digit-dense documents (see `GatedPattern` in the rules util).
    const probe = (rule.pattern as { probe?: RegExp }).probe;
    if (probe && !probe.test(input)) continue;
    // A credential, a PAN/IBAN, an e-mail or a phone inside a URL is STILL redacted — the
    // url gate only suppresses URL STRUCTURE (audit H-3 + F2, see `URL_EXEMPT_KINDS`).
    const credential = URL_EXEMPT_KINDS.has(cat);
    text = text.replace(rule.pattern, (m) => {
      if (isKept(m, keep) || (!credential && inUrlOnly(m))) return m;
      let val = m;
      if (rule.validate && !rule.validate(m)) {
        // Greedy validated match that swallowed a trailing token (an IBAN grabbing
        // a following " BIC …") — redact the valid inner PREFIX, keep the rest so
        // the following token (e.g. the BIC) is still matched by its own rule.
        const trimmed = longestValidPrefix(m, rule.validate);
        if (!trimmed) return m;
        val = trimmed;
      }
      return ensure(rule.type, val) + m.slice(val.length);
    });
  }

  // 3) Validated international phones (libphonenumber) the loose regex missed —
  //    run on the CURRENT text so a phone already redacted by the rule is skipped.
  if (!disabled.has("phone")) {
    for (const p of detectPhones(text)) {
      if (isKept(p.value, keep) || inUrlOnly(p.value)) continue;
      text = text.replace(new RegExp(escapeRegExp(p.value), "g"), () => ensure("phone", p.value));
    }
  }

  return { text, matches };
}

/** Convenience: just the redacted text. */
export function redactText(input: string, options?: RedactOptions): string {
  return redact(input, options).text;
}
