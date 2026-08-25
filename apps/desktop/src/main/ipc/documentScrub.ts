import { redact, redactionCategory } from "@openmasq/redact";

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
 */
export function makeDocumentScrub(
  vault: Record<string, string>,
  disabledKinds?: string[],
): DocumentScrub {
  const kinds: Record<string, string> = {};
  const spans: DocumentSpan[] = [];
  const seen = new Set<string>();

  const scrub = (text: string) => {
    const { text: t, matches } = redact(text, { vault, disabledKinds });
    for (const m of matches) {
      const kind = redactionCategory(m.category ?? m.type);
      kinds[m.value] = kind;
      if (!seen.has(m.value)) {
        seen.add(m.value);
        spans.push({ value: m.value, kind });
      }
    }
    return { text: t, pairs: matches.map((m) => ({ from: m.value, to: m.placeholder })) };
  };

  return { scrub, kinds, spans };
}
