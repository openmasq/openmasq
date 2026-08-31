import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { pseudonymize } from "./index";
import { isGenericTerm, isGenericCompound } from "./model/genericTerms";

/* Regression suite for the OCR'd notarial deed (promesse d'achat): the layout and
   vocabulary traps this document family carries, each of which shipped a leak or a
   corruption:
   - "VILLE (CP)" civil-status order, incl. the OCR-garbled city, the wrapped
     "PARIS 17ÈME\nARRONDISSEMENT (75017)" and the "(DÉPARTEMENT CP" open-paren
     forms — the city used to be faked while the REAL postal survived;
   - "Néà … le17 mars 1993" prose birth dates (glued OCR forms included);
   - the CRPCEN office number;
   - 3-token civil-status names ("Monsieur Yanis Octave VILLEMBERT") + the later
     SHORT form ("Monsieur Yanis VILLEMBERT") sharing ONE identity;
   - all-caps deed VOCABLES (PROMETTANT/VENDEUR/BIEN…) that must NEVER be faked;
   - a real "Maître GERMAIN" in the text that a NAME fake must never collide with. */

const text = readFileSync(
  fileURLToPath(new URL("./__fixtures__/acte-promesse-achat.txt", import.meta.url)),
  "utf8",
);

async function run() {
  const vault: Record<string, string> = {};
  const out = await pseudonymize(text, { vault });
  return { vault, text: out.text };
}

describe("acte notarié (promesse d'achat) — identifying values are redacted", () => {
  it("redacted names, places (city AND its postal), birth dates, CRPCEN, streets", async () => {
    const out = (await run()).text;
    const mustNotSurvive = [
      "VILLEMBERT", "Yanis", "BENKACEM", "Nadir", "Oussama", "MARBOEUF", "BOISNARDEL",
      "CRPCEN 78034", "45012",
      "CLIFHY-SOUS-BQIS", "(93390)", // OCR-garbled city + its REAL postal
      "(79000)", "(75017)", "(75018)", "93400",
      "17 mars 1993", "9 février 1988", // glued "le17…"/"le9…" birth dates
      "12 avenue des Tilleuls", "2 mail Camille du Gast",
      "84 rue des Tourterelles", "Rue des Frères Lombard", "RUE DES FRERES LOMBARD",
    ];
    for (const v of mustNotSurvive) expect(out).not.toContain(v);
  });

  it("the deed's legal vocables and amounts stay VERBATIM (no over-redaction)", async () => {
    const out = (await run()).text;
    for (const v of [
      "PROMETTANT", "ACQUEREUR", "VENDEUR", "BENEFICIAIRE", "LES PARTIES",
      "jouissance", "jouissance", "l'Exécution",
      "Code monétaire et financier",
      "152 000,00 EUR",
      "TERMINOLOGIE", "PROMESSE D'ACHAT",
    ]) {
      expect(out).toContain(v);
    }
  });

  it("one person = ONE surname fake across the long and short civil-status forms", async () => {
    const { vault } = await run();
    for (const surname of ["villembert", "benkacem"]) {
      const fakes = new Set(
        Object.entries(vault)
          .filter(([, real]) => real.toLowerCase() === surname)
          .map(([fake]) => fake.toLowerCase()),
      );
      expect(fakes.size).toBe(1);
    }
  });

  it("no NAME fake collides with the real 'Maître GERMAIN' present in the text", async () => {
    const { vault } = await run();
    for (const [fake, real] of Object.entries(vault)) {
      if (real.toLowerCase().includes("laurent")) continue; // LAURENT's own fake entry
      expect(fake.toLowerCase()).not.toContain("laurent");
    }
  });

  it("every vault original is fully substituted (nothing minted-but-unapplied)", async () => {
    const { vault, text: out } = await run();
    for (const original of Object.values(vault)) expect(out).not.toContain(original);
  });
});

describe("deed vocables are generic terms (any detector's candidate is dropped)", () => {
  it("party roles + property/legal nouns", () => {
    for (const w of [
      "promettant", "acquéreur", "bénéficiaire", "vendeur", "preneur", "créancier",
      "immeuble", "jouissance", "exécution", "notaire", "cadastre", "vendre",
    ]) {
      expect(isGenericTerm(w)).toBe(true);
    }
  });
  it("legal-code compounds are generic compounds", () => {
    expect(isGenericCompound("Code monétaire et financier")).toBe(true);
    expect(isGenericCompound("Code civil")).toBe(true);
  });
  it("a real org/person compound stays redactable", () => {
    expect(isGenericCompound("Cabinet Berlioz")).toBe(false);
    expect(isGenericTerm("Villembert")).toBe(false);
  });
});

describe("« née X » — l'état civil survit et la famille garde UN faux", () => {
  // Observed 13/08 (replayed 15/08): the detector can glue « née » into the name's span.
  // Without stripping, « née » was treated as a name token and got its
  // own fake: « née de La Roncheraye » → « sidonie de La Guilbaud » — the civil
  // status vanished and the model read a DIFFERENT person. The deed contradicted itself.
  const detect = (dict: Record<string, string>) => async (input: string) =>
    Object.entries(dict)
      .filter(([v]) => input.includes(v))
      .map(([value, category]) => ({ value, category }));

  it("span collé « née de La Roncheraye » : même famille, « née » verbatim", async () => {
    const vault: Record<string, string> = {};
    const { text } = await pseudonymize(
      "Madame Marie-Claire de La Roncheraye, épouse N'Dranoh, née de La Roncheraye le 12/03/1961.",
      {
        vault,
        detectLocal: detect({
          "Marie-Claire de La Roncheraye": "NAME",
          "née de La Roncheraye": "NAME",
        }),
      },
    );
    // The civil status stays VERBATIM on the wire…
    expect(text).toMatch(/née /);
    // …the real name is no longer there…
    expect(text).not.toContain("Roncheraye");
    // …and the « née » mention carries the SAME borrowed surname as the main name.
    const famille = /Madame \S+ de La (\S+),/.exec(text)?.[1];
    expect(famille).toBeTruthy();
    expect(text).toContain(`née de La ${famille}`);
    // No fake was minted for the word « née » itself.
    expect(Object.values(vault)).not.toContain("née");
  });
});
