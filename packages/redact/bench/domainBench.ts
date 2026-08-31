import { pseudonymize } from "../src/index";
import { scoreCorpus, pct, type BenchCase } from "./metric";

/**
 * The harness shared by every DOMAIN-vocabulary bench (technique, santé, scolaire…).
 *
 * A domain corpus measures two things at once, and they pull in opposite directions:
 * the real identities inside the document must still be caught (recall floor), and the
 * domain's own vocabulary around them must NOT be (the stay-clear list + an FP ceiling
 * so "redact everything" can never pass).
 *
 * ⚠️ The stay-clear half only means something with `proposingDetector`. The DETERMINISTIC
 * pipeline never proposes "Kubernetes" or "échographie" as an organisation — it is the
 * NER (or the remote model) that over-tags a dense technical or medical page, and that is
 * exactly where the vocabulary volumes act. A first version of this harness ran without a
 * detector and passed identically with and WITHOUT the volumes: it proved nothing. So the
 * detector is stubbed to propose every stay-clear term it finds in the text, which is a
 * faithful, and deliberately harsher, model of what a real NER does to these documents.
 */
export const detectVault = async (text: string): Promise<string[]> => {
  const vault: Record<string, string> = {};
  await pseudonymize(text, { vault });
  return Object.values(vault);
};

/** A detector that tags every stay-clear term present in the text as an ORG. */
export const proposingDetector =
  (vocabulary: readonly string[]) =>
  (text: string) =>
  async (): Promise<string> =>
    JSON.stringify(
      vocabulary
        .filter((t) => text.toLowerCase().includes(t.toLowerCase()))
        .map((value) => ({ value, category: "ORG" })),
    );

/** Every stay-clear term that the over-tagging detector managed to push into a vault. */
export async function vaultedDespiteVocabulary(
  cases: readonly BenchCase[],
  vocabulary: readonly string[],
): Promise<string[]> {
  const complete = proposingDetector(vocabulary);
  const vaulted = new Set<string>();
  for (const c of cases) {
    const vault: Record<string, string> = {};
    await pseudonymize(c.text, { vault, complete: complete(c.text) });
    for (const v of Object.values(vault)) vaulted.add(v.toLowerCase());
  }
  return vocabulary.filter((t) => vaulted.has(t.toLowerCase()));
}

/** Recall + FP over the corpus, with the one-line summary the bench prints. */
export async function scoreDomain(label: string, cases: readonly BenchCase[]) {
  const s = await scoreCorpus(cases as BenchCase[], detectVault);
  // eslint-disable-next-line no-console
  console.log(
    `[${label}] overall ${s.found}/${s.total} (${pct(s.found, s.total)}%) FP ${s.fp}` +
      (s.misses.length ? `\n  misses: ${s.misses.join(" · ")}` : ""),
  );
  return s;
}
