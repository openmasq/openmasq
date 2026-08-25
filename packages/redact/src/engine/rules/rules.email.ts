import type { RedactionRule } from "../../types";

// The EMAIL family — split out of rules.ts (300-LOC ratchet). Three arms, in the
// ORDER the table spreads them (after connection-string/env-secret, before ip):
export const EMAIL_RULES: RedactionRule[] = [
  {
    // Local-part and domain accept UNICODE letters (IDN/EAI: « rené.rebour@… »,
    // « müller@… »): the ASCII class ANCHORED MID-NAME on the accent and produced a
    // PARTIAL redaction — « rené. » stayed in clear, glued to the fake. Lookarounds
    // instead of \b on purpose: JS \b is ASCII-word-based and never finds a boundary
    // before an accented letter.
    type: "email",
    pattern:
      /(?<![\p{L}\p{N}._%+-])[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.\p{L}{2,}(?![\p{L}\p{N}-])/gu,
  },
  {
    // OBFUSCATED e-mail — `augustin [at] kelm.io`, `a (at) b (dot) io`. Written exactly
    // to dodge a scraper, which means the address is real and the person expects it to
    // reach them; the plain rule above saw no `@` and shipped it in clear (measured).
    // The bracket is REQUIRED (never a bare " at "), so ordinary prose can't match.
    type: "email",
    pattern:
      /\b[A-Za-z0-9._%+-]+\s*[[({<]\s*(?:at|arobase)\s*[\])}>]\s*[A-Za-z0-9.-]+(?:\s*[[({<]\s*(?:dot|point)\s*[\])}>]\s*[A-Za-z0-9-]+)*(?:\.[A-Za-z]{2,})?\b/gi,
  },
  {
    // OCR-SPLIT e-mail — Tesseract routinely detaches the `@` as its own token
    // (« amelie.brivet @example.com », measured on both scan fixtures), and the plain
    // rule's contiguous form shipped the address in clear. EXACTLY ONE space, on one
    // side or both — never a run (a column gutter is not an address) — and a dot in
    // the local part or ≥2 domain labels, so prose like « prix @ 10 % » or a handle
    // before an unrelated word can't match. The value keeps the space VERBATIM (the
    // vault replaces what the text carries). `scans.recall.test.ts` measures it.
    type: "email",
    pattern:
      /(?<![\p{L}\p{N}._%+-])(?:[\p{L}\p{N}\p{M}_%+-]+\.[\p{L}\p{N}\p{M}._%+-]+ ?@ ?|[\p{L}\p{N}\p{M}._%+-]+ ?@ ?(?=[\p{L}\p{N}.-]+\.[\p{L}\p{N}.-]*\.))[\p{L}\p{N}.-]+\.\p{L}{2,}(?![\p{L}\p{N}-])/gu,
  },
];
