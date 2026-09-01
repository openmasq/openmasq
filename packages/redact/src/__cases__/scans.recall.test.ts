import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { extractText } from "../documents/documents";
import { pseudonymize } from "../index";
import { scoreCase, pct, type BenchCase } from "../../bench/metric";

/* The FIRST harness that measures detection on REAL scans — real OCR (the
   vendored Tesseract, embedded WASM, deterministic), full pipeline, truths
   hand-annotated from the pixels. Every other bench simulates OCR damage
   by typing it; this one PRODUCES it. It's the prerequisite for the
   « visual detection » item: without it, no zone rule is falsifiable.

   The truths are written AS THE IMAGE CARRIES THEM (not as the OCR
   reads them) — a stray space in the OCR'd email is exactly the kind of
   leak this bench exists to count. Runs in `pnpm test:corpus` (OCR
   costs ~6s per image, deliberately kept out of the fast loop). */

const fx = (name: string): string =>
  fileURLToPath(new URL(`../__fixtures__/${name}`, import.meta.url));

const CASES: (BenchCase & { file: string })[] = [
  {
    id: "scan-titre-sejour",
    file: "scanned-id.jpg",
    lang: "fr",
    text: "", // filled in by the real OCR
    // Re-annotated on 2026-08-31: the fixtures were REGENERATED at the split (same
    // templates, new synthetic identities — BRIVET/Turenne/75003) and the truths
    // follow the pixels that ship, not those of the old tree.
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
      expect(file.text.trim().length).toBeGreaterThan(40); // the OCR actually read something
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
    // RATCHET floor — measured 20/20 at writing time (after closing the four
    // leaks: OCR-spaced email, document no, place of birth, badge); 0.95
    // leaves ONE truth of margin. A drop = a regression on a real scan.
    expect(found / total).toBeGreaterThanOrEqual(0.95);
    expect(fp).toBeLessThanOrEqual(1);
  }, 120_000);
});
