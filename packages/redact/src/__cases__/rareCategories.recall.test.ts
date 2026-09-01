import { describe, it, expect } from "vitest";
import { pseudonymize } from "../index";
import { scoreCorpus, coversTruth, pct, type BenchCase } from "../../bench/metric";
import corpus from "../../bench/corpora/rareCategories.json";

/* Recall bench for the RARE categories — BIC, card, company, URL, amount, deed date,
   place « VILLE (CP) », path, secret.

   This corpus exists for a MEASUREMENT reason, not product coverage: nine categories
   had fewer than 20 truths in the bench (BIC and CARD had only ONE), and under that
   threshold a per-category percentage means nothing — a single value makes 0 or 100%.
   Each category now carries at least 20 truths, spread across real documents from
   their natural setting: RIB and SEPA mandates for BIC, cash-register exports and SAV
   tickets for the card, deeds and Kbis for the company, configs and runbooks for the secret.

   The values are VALID by construction: Luhn-valid cards, IBANs with a correct check
   key. An invalid datum would measure the engine's tolerance, not its recall.

   Scores the WHOLE deterministic pipeline exactly as it ships (`pseudonymize`, no model),
   like `juridique` / `layouts` / `technique`. */

const cases = corpus as BenchCase[];

const detect = async (text: string): Promise<string[]> => {
  const vault: Record<string, string> = {};
  await pseudonymize(text, { vault });
  return Object.values(vault);
};

/** The categories the DETERMINISTIC pipeline must hold at 100%: they have a shape, a
 *  checksum or a prefix — none needs linguistic context. This is the real
 *  floor of this corpus; the overall rate, on the other hand, is dragged down by out-of-scope
 *  categories (see the next test). */
const STRUCTURED = ["CARD", "IBAN", "PATH", "EMAIL", "PHONE"] as const;

describe("rare-category recall (full deterministic pipeline)", () => {
  it("ne rate AUCUNE donnée à forme vérifiable (carte, IBAN, chemin, e-mail, téléphone)", async () => {
    const missed: string[] = [];
    for (const c of cases) {
      const detected = await detect(c.text);
      for (const [value, cat] of c.truth) {
        if ((STRUCTURED as readonly string[]).includes(cat) && !coversTruth(value, detected))
          missed.push(`${c.id}/${cat}:${value}`);
      }
    }
    expect(missed, `structuré manqué : ${missed.join(" · ")}`).toEqual([]);
  });

  it("holds the recall floor on the categoriesRares corpus", async () => {
    const s = await scoreCorpus(cases, detect);
    // eslint-disable-next-line no-console
    console.log(
      `[categoriesRares] overall ${s.found}/${s.total} (${pct(s.found, s.total)}%) FP ${s.fp}` +
        (s.misses.length ? `\n  misses: ${s.misses.join(" · ")}` : ""),
    );
    // ⚠️ The floor is LOW because two families of truths are outside the scope the
    // product covers TODAY, and the corpus annotates them anyway — that's what makes the
    // measure honest:
    //   · `AMOUNT` is a category RETIRED by decision (`RETIRED_CATEGORIES`): 23 truths
    //     that will never be found as long as the decision holds;
    //   · `DATE` here carries deed, hiring and marriage dates — the date detector
    //     is deliberately gated by BIRTH context, so as not to redact every
    //     date in a document.
    // The floor therefore guards the REST: that the deterministic pipeline doesn't lose what it already holds.
    // Ratchet 0.65 → 0.75 (INSEE first-name tail, measured 79%) → 0.78 (particles
    // + « initial + SURNAME » from phase B, measured 82%).
    expect(s.found / s.total).toBeGreaterThanOrEqual(0.78);
  });

  it("garde un taux de faux positifs BAS", async () => {
    const s = await scoreCorpus(cases, detect);
    // These documents are full of uppercase labels (BIC, IBAN, KBIS, RUNBOOK) and
    // company names: exactly the material that causes over-redacting. Presidio produces 28
    // false positives on the same texts, including the words « BIC » and « IBAN » themselves.
    expect(s.fp / s.total).toBeLessThanOrEqual(0.1);
  });
});
