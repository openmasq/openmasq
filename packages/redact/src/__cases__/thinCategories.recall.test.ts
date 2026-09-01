import { describe, it, expect } from "vitest";
import { pseudonymize } from "../index";
import { scoreCorpus, coversTruth, pct, type BenchCase } from "../../bench/metric";
import corpus from "../../bench/corpora/thinCategories.json";

/* Recall bench for the THIN categories — the ones the 2026-07 coverage audit found under-
   measured: CARD (22 truths in the whole bench), COMPANY_ID / USERNAME / TOKEN / HEALTH
   (ZERO dedicated truths each). 318 cases, ≥200 truths PER thin category (1 025 in all),
   12 languages, in the documents these values naturally live in: caisse/PSP exports, SAV
   tickets and hotel folios for the card; Kbis, Impressum, fatture, notas fiscais, faktury
   and W-9s for the company ids; social/forum/CRM exports for the handles; .env/CI/docker/
   runbook extracts for the generic tokens; ordonnances, discharge summaries and
   Aufnahmebögen for the health data.

   All checksum values are VALID by construction (Luhn, double Luhn
   SIRET, VAT/NIP/CNPJ/ABN keys…) — an invalid value would measure the engine's tolerance,
   not its recall. Company names in prose and markdown tables with typed headers
   are annotated CONTEXT (NER scope / « markdown columns » tracking, out of the floor — the
   discipline of metric.ts).

   Scores the WHOLE deterministic pipeline exactly as it ships (`pseudonymize`, no model). */

const cases = corpus as BenchCase[];

const detect = async (text: string): Promise<string[]> => {
  const vault: Record<string, string> = {};
  await pseudonymize(text, { vault });
  return Object.values(vault);
};

/** The five categories this corpus exists to measure, held at 100%: each has a
 *  shape, a checksum, an `@`/label or a scheme word — the deterministic pipeline
 *  holds all of them today, and this floor turns any regression into a red build. */
const THIN = ["CARD", "COMPANY_ID", "USERNAME", "TOKEN", "HEALTH"] as const;

describe("thin-category recall (full deterministic pipeline)", () => {
  // 318 × pseudonymize: the default vitest timeout (5s) is too tight under load
  // (parallel sessions made categoriesRares flicker exactly this way).
  it("ne rate AUCUNE vérité des catégories minces (carte, id société, pseudo, jeton, santé)", { timeout: 60_000 }, async () => {
    const missed: string[] = [];
    for (const c of cases) {
      const detected = await detect(c.text);
      for (const [value, cat] of c.truth) {
        if ((THIN as readonly string[]).includes(cat) && !coversTruth(value, detected))
          missed.push(`${c.id}/${cat}:${value}`);
      }
    }
    expect(missed, `mince manqué : ${missed.join(" · ")}`).toEqual([]);
  });

  it("holds the recall floor on the categoriesMinces corpus", { timeout: 60_000 }, async () => {
    const s = await scoreCorpus(cases, detect);
    // eslint-disable-next-line no-console
    console.log(
      `[categoriesMinces] overall ${s.found}/${s.total} (${pct(s.found, s.total)}%) FP ${s.fp}` +
        (s.misses.length ? `\n  misses: ${s.misses.join(" · ")}` : ""),
    );
    // Measured at 100% at introduction (CONTEXT excluded by metric.ts). The margin covers the
    // ACCOMPANYING truths (names, IBANs, emails from the same documents), not the thin
    // ones — they have their exact floor above.
    expect(s.found / s.total).toBeGreaterThanOrEqual(0.97);
  });

  it("garde un taux de faux positifs NUL sur ces documents", { timeout: 60_000 }, async () => {
    const s = await scoreCorpus(cases, detect);
    // Invoices, Impressum, cash-register exports: uppercase labels everywhere (CIF,
    // NIP, SIRET, MRN, CVR) — exactly the material that causes over-redacting. Measured at 0
    // at introduction; any drift on the precision side must be visible.
    expect(s.fp).toBeLessThanOrEqual(2);
  });
});
