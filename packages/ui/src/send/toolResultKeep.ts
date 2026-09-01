import { pythonFrameworkKeep, toolDiscoveryKeep } from "../agent/toolRedactionPolicy";

/**
 * The per-call `keep` list for ONE tool-result redaction pass — everything the engine may
 * leave in clear for THIS result, merged in one place so `toolResult.ts` (LOC-capped)
 * stays a thin pipeline. Three layers, each with its own fail-closed rationale:
 *
 * 1. The send's own `keep` (connected-integration names, reveals, deselected chips).
 * 2. The per-tool SHAPE keep-list — never a category-clear (rule 7):
 *    - `run_python` → `pythonFrameworkKeep`: stdout/tracebacks are full of PUBLIC
 *      library/module identifiers (numpy/scipy + site-packages segments) the detector
 *      mis-flags as org/secret; vaulting them corrupts the NEXT run's code and, via
 *      `toWire`, every later tool call. The sandbox runs UN-REDACTED, so the vault's
 *      real values are threaded in and can never be spared (fake→real-oracle guard).
 *    - every OTHER tool → `toolDiscoveryKeep`: tool-DISCOVERY metadata (API tool names,
 *      tech terms) on a discovery-SHAPED result only — what stops the NER from vaulting
 *      `execute-sql → jade-tom` and derailing a meta-tool's loop. A DATA result gets [].
 * 3. `wireClearKeep` below — the coherence guard for values ALREADY in clear on the wire.
 */
export function toolResultKeep(
  tool: string | undefined,
  text: string,
  opts: {
    engineKeep: readonly string[];
    /** The conversation vault's REAL values — never spared by any layer. */
    vaultValues: string[];
    /** The USER turns of THIS send's wire (post-redaction) — `wireClearKeep`'s source. */
    wireUserTexts: readonly string[];
    /** Coffre/forced values + extra secrets — their « toujours masqué » contract wins. */
    protectedValues: string[];
  },
): string[] {
  const shape =
    tool === "run_python"
      ? pythonFrameworkKeep(text, opts.vaultValues)
      : toolDiscoveryKeep(text, opts.vaultValues);
  return [
    ...opts.engineKeep,
    ...shape,
    ...wireClearKeep(text, opts.wireUserTexts, [...opts.protectedValues, ...opts.vaultValues]),
  ];
}

// `wireClearKeep` tuning: source bounded like the engine's `avoid` blobs; a detected span
// is at most a few words, so 4-grams cover it; 1-2-char grams are function words the
// engine never vaults — excluding them keeps the list meaningful.
const WIRE_SOURCE_MAX_CHARS = 20_000;
const MAX_GRAM_WORDS = 4;
const MIN_GRAM_CHARS = 3;

// A "word" as a detected span carries it: letters/digits with internal joiners, so an
// e-mail, a dotted/hyphenated id or an elided name stays ONE token ("a@b.fr", "Jean-Luc").
const WORD = /[\p{L}\p{N}]+(?:[@._'’-][\p{L}\p{N}]+)*/gu;

/**
 * The COHERENCE guard of the tool-result pass: a value that already reached the model IN
 * CLEAR — it sits verbatim in a USER turn of this send's wire, i.e. the engine's own
 * user-message pass left it there — must not receive a fake when it echoes back in a tool
 * result. Minting one protects nothing (the model has the real value, and the provider
 * can correlate the search args with the result) while making the conversation incoherent:
 * the model searches the REAL value, receives the FAKE, and concludes the two are
 * unrelated. Sparing the echo is egress-neutral by construction — every candidate below
 * appears in text that ALREADY left the machine this send.
 *
 * Mechanics: word n-grams (1..4) of the wire USER texts, lowercased (the engine's `keep`
 * match is case-insensitive), kept only when present verbatim in this result. Matching
 * `isKept` is exact-span, so multi-word spans need their multi-word gram — hence n-grams,
 * not words.
 *
 * SECURITY (rule 7/11) — why this cannot become a fake→real oracle:
 * - The source is the WIRE user text, i.e. text the model already received: nothing new
 *   can ever be exposed. Tool/assistant text is NOT a source — a prompt-injected result
 *   cannot seed the harvest.
 * - A gram touching a PROTECTED value (vault REAL, Coffre/forced, extra secret) is dropped
 *   in BOTH inclusion directions, fail-closed: a vault real never rides the wire in clear
 *   (the replay fakes it), so dropping costs nothing; a Coffre value's contract
 *   (« toujours masqué, quelle que soit la source ») outranks coherence.
 * - Over-dropping only costs coherence, never privacy — every guard errs that way.
 */
export function wireClearKeep(
  resultText: string,
  wireUserTexts: readonly string[],
  protectedValues: Iterable<string>,
): string[] {
  if (!resultText || !wireUserTexts.length) return [];
  const resLower = resultText.toLowerCase();
  const grams = new Set<string>();
  let budget = WIRE_SOURCE_MAX_CHARS;
  // Most recent user turn first — it is the one the current tool call answers.
  for (let i = wireUserTexts.length - 1; i >= 0 && budget > 0; i--) {
    const src = (wireUserTexts[i] ?? "").slice(0, budget);
    budget -= src.length;
    const words = src.match(WORD) ?? [];
    for (let w = 0; w < words.length; w++) {
      // Head word absent from the result ⇒ every gram starting with it is absent too.
      if (!resLower.includes(words[w].toLowerCase())) continue;
      let gram = "";
      for (let n = 0; n < MAX_GRAM_WORDS && w + n < words.length; n++) {
        gram += (n ? " " : "") + words[w + n].toLowerCase();
        if (!resLower.includes(gram)) break;
        if (gram.length >= MIN_GRAM_CHARS) grams.add(gram);
      }
    }
  }
  if (!grams.size) return [];
  const guarded = [...protectedValues].map((v) => v.trim().toLowerCase()).filter(Boolean);
  return [...grams].filter((g) => !guarded.some((p) => g.includes(p) || p.includes(g)));
}
