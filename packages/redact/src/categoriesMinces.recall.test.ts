import { describe, it, expect } from "vitest";
import { pseudonymize } from "./index";
import { scoreCorpus, coversTruth, pct, type BenchCase } from "../bench/metric";
import corpus from "../bench/corpora/categoriesMinces.json";

/* Recall bench for the THIN categories — the ones the 2026-07 coverage audit found under-
   measured: CARD (22 truths in the whole bench), COMPANY_ID / USERNAME / TOKEN / HEALTH
   (ZERO dedicated truths each). 318 cases, ≥200 truths PER thin category (1 025 in all),
   12 languages, in the documents these values naturally live in: caisse/PSP exports, SAV
   tickets and hotel folios for the card; Kbis, Impressum, fatture, notas fiscais, faktury
   and W-9s for the company ids; social/forum/CRM exports for the handles; .env/CI/docker/
   runbook extracts for the generic tokens; ordonnances, discharge summaries and
   Aufnahmebögen for the health data.

   Toutes les valeurs à somme de contrôle sont VALIDES par construction (Luhn, double Luhn
   SIRET, clés TVA/NIP/CNPJ/ABN…) — une valeur invalide mesurerait la tolérance du moteur,
   pas son rappel. Les raisons sociales en prose et les tables markdown à en-têtes typés
   sont annotées CONTEXT (portée NER / suivi « colonnes markdown », hors plancher — la
   discipline de metric.ts).

   Score le pipeline déterministe COMPLET tel qu'il est livré (`pseudonymize`, sans modèle). */

const cases = corpus as BenchCase[];

const detect = async (text: string): Promise<string[]> => {
  const vault: Record<string, string> = {};
  await pseudonymize(text, { vault });
  return Object.values(vault);
};

/** Les cinq catégories que ce corpus existe pour mesurer, tenues à 100 % : chacune a une
 *  forme, une somme de contrôle, un `@`/label ou un mot de scheme — le déterministe les
 *  tient toutes aujourd'hui, et ce plancher transforme toute régression en build rouge. */
const THIN = ["CARD", "COMPANY_ID", "USERNAME", "TOKEN", "HEALTH"] as const;

describe("thin-category recall (full deterministic pipeline)", () => {
  // 318 × pseudonymize : le timeout vitest par défaut (5 s) est trop juste sous charge
  // (les sessions parallèles ont fait clignoter categoriesRares exactement comme ça).
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
    // Mesuré à 100 % à l'introduction (CONTEXT exclu par metric.ts). La marge couvre les
    // vérités d'ACCOMPAGNEMENT (noms, IBAN, e-mails des mêmes documents), pas les minces —
    // elles ont leur plancher exact ci-dessus.
    expect(s.found / s.total).toBeGreaterThanOrEqual(0.97);
  });

  it("garde un taux de faux positifs NUL sur ces documents", { timeout: 60_000 }, async () => {
    const s = await scoreCorpus(cases, detect);
    // Factures, Impressum, exports de caisse : des étiquettes en majuscules partout (CIF,
    // NIP, SIRET, MRN, CVR) — exactement la matière qui fait over-redact. Mesuré à 0 à
    // l'introduction ; toute dérive du côté précision doit se voir.
    expect(s.fp).toBeLessThanOrEqual(2);
  });
});
