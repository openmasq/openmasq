// The fake ALREADY assigned to a person — the two ways to find it again, pulled out of
// `pseudonymize/allocate.ts` (300-LOC cap) and placed where the rest of identity lives.
//
// The allocator doesn't mint a new fake until neither of the two has answered:
// that's what holds the invariant "one real value → ONE fake, for the whole
// conversation". This module MUTATES nothing; it returns the fake to reuse, or `undefined`.
import { recaseLike } from "../../recase";
import { capitalize } from "../../util";
import { reconstructName } from "./name";

/** Resolvers supplied by the current pass (see `pseudonymize/index.ts`). */
interface IdentityResolvers {
  /** The canonical fake of A SINGLE WORD (name token, domain), case-tolerant. */
  resolveFakeCI: (real: string) => string | undefined;
  /** The fake of a WHOLE VALUE already known to the vault, whatever its casing. */
  resolveEntityFakeCI: (real: string) => string | undefined;
}

/**
 * The fake to reuse for `value`, recased onto THIS occurrence — or `undefined` if a
 * fresh one must be minted. Two paths, in this order:
 *
 * 1. **By WORDS** (`reconstructName`): each word already has its canonical fake, so the
 *    whole name is reconstructed. Recasing is essential — a canonical alias is stored
 *    lowercase, and a casing that neither alias (Title + lowercase) covers —
 *    typically the ALL-CAPS of a form header — was left UNMAPPED, so the
 *    real name went out to the model.
 * 2. **By WHOLE VALUE** (`resolveEntityFakeCI`): the vault already knows this entity
 *    under another casing AND, most often, under another CATEGORY. This is the case of a
 *    tool result — document 1 vaulted « KARL STUDIO » as ORGANISATION (whole
 *    entry, no per-word alias), the next result writes « Karl Studio », the first-name
 *    lexicon classes it NAME, and the allocator was minting a SECOND identity for the same
 *    company. The `isRecase` categories already handled this; NAME was the only hole.
 *    ⚠️ Only shows up with a PRE-LOADED vault: a single-pass probe unifies
 *    casings on its own and wrongly concludes the engine is sound (`aiKinds.test.ts`).
 *
 * `input` acts as a last-resort safeguard: a fake that ALREADY appears in the text isn't one.
 */
export function reuseNameFake(
  value: string,
  input: string,
  { resolveFakeCI, resolveEntityFakeCI }: IdentityResolvers,
): string | undefined {
  const reconstructed = reconstructName(value, resolveFakeCI);
  if (reconstructed) {
    const base = reconstructed
      .split(/([\s._-]+)/) // the separators by which a name's words are joined
      .map((t, i) => (i % 2 === 1 ? t : capitalize(t)))
      .join("");
    return recaseLike(base, value);
  }
  const known = resolveEntityFakeCI(value);
  if (known === undefined) return undefined;
  const cased = recaseLike(known, value);
  return cased !== value && !input.includes(cased) ? cased : undefined;
}
