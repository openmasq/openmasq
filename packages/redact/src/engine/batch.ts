/**
 * Batch-redaction primitive: redact MANY texts in ONE engine pass.
 *
 * The agent loop can run a turn's read-only tool calls in parallel, but the RESULT
 * redaction must stay vault-atomic (a value seen in two results gets ONE fake), so it
 * is serialised — which means a slow engine (remote Scaleway = a network round-trip,
 * local BERT-NER = a single onnxruntime instance) pays that cost N times. Batching
 * collapses N results into a SINGLE `redactOne` call: join with a rare sentinel, redact
 * the whole blob once, split back. One round-trip / one inference for N results, and
 * still atomic (one pass over one shared vault).
 *
 * ⚠️ The caller must batch only texts that share the SAME redaction policy (e.g. don't
 * mix a web-search result — which keeps place/org names — with a private CRM result);
 * group by policy, then `batchRedact` each group.
 *
 * Pure (no engine dependency): `redactOne` is injected, so it works with `pseudonymize`,
 * `remoteRedact`, or the local NER path identically. Unit-tested in `batch.test.ts`.
 */

// A record separator with NO PII shape, so no engine touches it and it survives verbatim.
// `␞` (U+241E, SYMBOL FOR RECORD SEPARATOR) padded so it can't glue to adjacent tokens.
const SENTINEL = "\n␞␞␞ OPENMASQ_BATCH_SEP ␞␞␞\n";

export async function batchRedact(
  texts: string[],
  redactOne: (text: string) => string | Promise<string>,
): Promise<string[]> {
  if (texts.length === 0) return [];
  if (texts.length === 1) return [await redactOne(texts[0]!)];
  const out = await redactOne(texts.join(SENTINEL));
  const parts = out.split(SENTINEL);
  // If the sentinel didn't survive intact (a model paraphrased it, a chunk boundary split
  // it), fall back to per-text redaction so we NEVER mis-attribute a result to the wrong
  // tool call. Correctness beats the batching win. ⚠️ SEQUENTIAL, never Promise.all: the
  // passes share ONE vault, and two concurrent check-then-write allocations can mint TWO
  // fakes for the same value — the exact atomicity the caller serialises for.
  if (parts.length !== texts.length) {
    const each: string[] = [];
    for (const t of texts) each.push(await redactOne(t));
    return each;
  }
  return parts;
}
