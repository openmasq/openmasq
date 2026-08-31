import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { extractText } from "./documents/documents";
import { pseudonymize } from "./index";
import { scoreCase, pct, type BenchCase } from "../bench/metric";

/* Le PREMIER harnais qui mesure la détection sur de VRAIS scans — OCR réel (le
   Tesseract vendoré, WASM embarqué, déterministe), pipeline complet, vérités
   annotées à la main depuis les pixels. Tous les autres bancs simulent le dégât
   OCR en le tapant ; celui-ci le PRODUIT. C'est le prérequis de l'item
   « détection visuelle » : sans lui, aucune règle de zone n'est falsifiable.

   Les vérités sont écrites TELLES QUE L'IMAGE LES PORTE (pas telles que l'OCR
   les lit) — un espace parasite dans l'email océrisé est exactement le genre de
   fuite que ce banc existe pour compter. Tourne dans `pnpm test:corpus` (l'OCR
   coûte ~6 s par image, exprès hors de la boucle rapide). */

const fx = (name: string): string =>
  fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url));

const CASES: (BenchCase & { file: string })[] = [
  {
    id: "scan-titre-sejour",
    file: "scanned-id.jpg",
    lang: "fr",
    text: "", // rempli par l'OCR réel
    // Réannoté le 2026-08-31 : les fixtures ont été RÉGÉNÉRÉES au split (mêmes
    // gabarits, identités synthétiques neuves — BRIVET/Turenne/75003) et les vérités
    // suivent les pixels qui shippent, pas ceux de l'ancien arbre.
    truth: [
      ["BRIVET", "NAME"],
      ["Amelie Claire", "NAME"],
      ["12 / 04 / 1989", "DOB"],
      ["Lyon", "CITY"],
      ["FR-89047523100424", "ID"],
      ["1 89 04 75 231 004 24", "ID"],
      ["27 rue de Turenne", "ADDRESS"],
      ["75003", "POSTAL"],
      ["Paris", "CITY"],
      ["+33 6 12 34 56 78", "PHONE"],
      ["amelie.brivet@example.com", "EMAIL"],
    ],
  },
  {
    id: "scan-carte-visite",
    file: "business-card.png",
    lang: "fr",
    text: "",
    truth: [
      ["Amelie Brivet", "NAME"],
      ["amelie.brivet@example.com", "EMAIL"],
      ["+33 6 12 34 56 78", "PHONE"],
      ["27 rue de Turenne", "ADDRESS"],
      ["75003", "POSTAL"],
      ["Paris", "CITY"],
      ["10.10.4.21", "IP"],
      ["B-58421", "ID"],
      ["FR76 3000 6000 0112 3456 7890 189", "IBAN"],
    ],
  },
];

describe("scans réels — OCR véritable, pipeline complet, vérités depuis les pixels", () => {
  it("tient le plancher de rappel sur les deux fixtures scannées", async () => {
    let found = 0;
    let total = 0;
    let fp = 0;
    const misses: string[] = [];
    for (const c of CASES) {
      const file = await extractText(fx(c.file));
      expect(file.text.trim().length).toBeGreaterThan(40); // l'OCR a réellement lu
      const vault: Record<string, string> = {};
      await pseudonymize(file.text, { vault });
      const s = scoreCase({ ...c, text: file.text }, Object.values(vault));
      found += s.found;
      total += s.total;
      fp += s.fp;
      misses.push(...s.misses);
    }
    // eslint-disable-next-line no-console
    console.log(`[scans] overall ${found}/${total} (${pct(found, total)}%) FP ${fp}\n  misses: ${misses.join(" · ") || "none"}`);
    // Plancher CLIQUET — mesuré 20/20 à l'écriture (après fermeture des quatre
    // fuites : email à espace OCR, document no, place of birth, badge) ; 0,95
    // laisse UNE vérité de marge. Une baisse = une régression sur un vrai scan.
    expect(found / total).toBeGreaterThanOrEqual(0.95);
    expect(fp).toBeLessThanOrEqual(1);
  }, 120_000);
});
