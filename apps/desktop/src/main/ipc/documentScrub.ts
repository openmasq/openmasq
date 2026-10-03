import { escapeRegExp, isWordGlued, redact, redactionCategory } from "@openmasq/redact";

/** One masked value and the category it was filed under. Internal: it names a field of
 *  `DocumentScrub` and nothing outside this module refers to it by name. */
interface DocumentSpan {
  value: string;
  kind: string;
}

export interface DocumentScrub {
  /** Pass to `redactFileInPlace`: rewrites a text run and records what it masked. */
  scrub: (text: string) => { text: string; pairs: { from: string; to: string }[] };
  /** REAL value → fine category. Merged into the conversation's `redactionKinds`. */
  kinds: Record<string, string>;
  /** The distinct masked values, in first-seen order — the redaction log's rows. */
  spans: DocumentSpan[];
}

/**
 * The document pass's classifier, extracted from `registerFilesIpc` so the thing that
 * broke can be CALLED by a test instead of described in a comment.
 *
 * ⚠️ **`redactionCategory`, never `redactionKind`.** Both take a rule type and both
 * return a string, so the wrong one compiles and ships in silence — but they answer
 * different questions. `redactionKind` gives 8 coarse COLOUR buckets and has no branch
 * for address / location / city / postal_code / national_id / dob / date / iban / bic /
 * card / url: all eleven fall through its `return "secret"`.
 *
 * And `kinds` is read everywhere as the FINE, user-facing category — the redaction
 * journal, the per-value hue, and Réglages → Confidentialité (which counts rows by
 * `redactionCategory`). So a filed PDF's addresses were shelved under « Clés & secrets »
 * and painted red, while the SAME address typed into the message got its real category:
 * two passes, one map, no agreement. `documentKinds.parity.test.ts` pins it.
 *
 * The `vault` is MUTATED across calls on purpose — a document is scrubbed run by run and
 * every run must reuse the substitute the previous one minted, or the same value leaves
 * under two different fakes and the reply cannot be restored.
 *
 * ⚠️ **The rules alone find no NAME.** `redact` is the regex pass: a person, a company, a
 * place found by the offline NER exists only as a vault pair. So every value the vault
 * ALREADY holds when the scrub is built (the send's pairs + the document's whole-text
 * drop-time map, `docScrubVault`) is also replaced, whole-word, wherever a run contains it:
 * the masked copy holds no value the vault knows. `knownKinds` (real →
 * category, display only) files those values; one whose category is in `disabledKinds` is
 * left as is, like the rules. Unknown category ⇒ masked (fail closed).
 */
export function makeDocumentScrub(
  vault: Record<string, string>,
  disabledKinds?: string[],
  knownKinds: Record<string, string> = {},
): DocumentScrub {
  const kinds: Record<string, string> = {};
  const spans: DocumentSpan[] = [];
  const seen = new Set<string>();
  const record = (value: string, kind: string) => {
    kinds[value] = kind;
    if (!seen.has(value)) {
      seen.add(value);
      spans.push({ value, kind });
    }
  };
  const known = compileKnown(vault, knownKinds, new Set(disabledKinds ?? []));

  const scrub = (text: string) => {
    const { text: t, matches } = redact(text, { vault, disabledKinds });
    for (const m of matches) record(m.value, redactionCategory(m.category ?? m.type));
    const pairs = matches.map((m) => ({ from: m.value, to: m.placeholder }));
    if (!known) return { text: t, pairs };
    const out = t.replace(known.re, (m: string, offset: number) => {
      const fake = known.fakeOf.get(m);
      if (fake === undefined || isWordGlued(t, offset, m)) return m;
      record(m, known.kindOf(m));
      pairs.push({ from: m, to: fake });
      return fake;
    });
    return { text: out, pairs };
  };

  return { scrub, kinds, spans };
}

/** One alternation over the vault's real values, longest first, built ONCE per document
 *  (a DOCX is thousands of runs). `null` when there is nothing to apply. */
function compileKnown(
  vault: Record<string, string>,
  knownKinds: Record<string, string>,
  disabled: Set<string>,
): { re: RegExp; fakeOf: Map<string, string>; kindOf: (v: string) => string } | null {
  const kindOf = (v: string) => (knownKinds[v] ? redactionCategory(knownKinds[v]) : "name");
  const fakeOf = new Map<string, string>();
  for (const [fake, real] of Object.entries(vault)) {
    if (real.length < 2 || fakeOf.has(real)) continue;
    if (knownKinds[real] && disabled.has(kindOf(real))) continue;
    fakeOf.set(real, fake);
  }
  if (!fakeOf.size) return null;
  const values = [...fakeOf.keys()].sort((a, b) => b.length - a.length);
  return { re: new RegExp(values.map(escapeRegExp).join("|"), "g"), fakeOf, kindOf };
}
