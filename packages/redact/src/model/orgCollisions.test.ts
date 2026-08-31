import { describe, expect, it } from "vitest";
import { pseudonymize, unredact } from "../index";
import type { Vault } from "../types";
import { fakeFor } from "./fakes";
import { FAKE_ORG, ORG_ROOTS, ORG_SUFFIXES } from "./fakes/pools";
import { GENERIC_ORG_WORD, buildFakeFragments } from "./orgFragments";

/**
 * Regression from the "company cross-referencing" audit: a multi-company document
 * produced « BRANTLEY Systems » / « Brantley Systems » / « Brantley Systems-2/-3/-4 »
 * for FIVE different real companies — the exact-length pool only offered
 * 1-3 candidates, everything cascaded into the suffixed fallback, and that fallback checked
 * `taken` case-sensitively without consulting the word guard. A model normalizing the casing
 * of an echo then made `unredact` restore the WRONG company.
 */

/** The distinctive words of a fake (same folding as `fakeWordIndex`). */
const fold = (w: string) => w.normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase();
const distinctive = (fake: string): string[] =>
  (fake.match(/\p{L}[\p{L}\p{M}'’-]*/gu) ?? [])
    .map(fold)
    .filter((w) => w.length >= 3 && !GENERIC_ORG_WORD.has(w));

/** The audit's doc: 15 companies, 5 of them the same length (16 characters). */
const COMPANIES = [
  "Atelier Torbel", "Nexity Ouest", "Groupe Balmont", "Cabinet Verland", "Maison Delorme",
  "SCI Les Tilleuls", "Transports Bodin", "Menuiserie Priol", "Boulangerie Ruiz",
  "Studio Karma", "Agence Littoral", "Domaine Vacher", "Imprimerie Josse",
  "Clinique Estran", "Garage Morvan",
];

async function fakeDocument(companies: string[], salt: number): Promise<Vault> {
  const vault: Vault = {};
  const input = companies.map((c, i) => `Le fournisseur n°${i + 1} est ${c}.`).join("\n");
  const { text } = await pseudonymize(input, {
    vault,
    salt,
    forced: companies.map((value) => ({ value, category: "ORG" })),
  });
  for (const c of companies) expect(text, `${c} a fui dans le wire`).not.toContain(c);
  expect(unredact(text, vault)).toBe(input); // reversible, always
  return vault;
}

describe("collisions d'entreprises — un document, N sociétés", () => {
  it("15 sociétés → 15 bases sans AUCUN mot distinctif partagé, zéro repli suffixé", async () => {
    const vault = await fakeDocument(COMPANIES, 987654321);
    const fakes = COMPANIES.map(
      (c) => Object.entries(vault).find(([, real]) => real === c)![0],
    );
    // Never again « Brantley Systems-2 »: the combinatorial pool + length
    // tolerance must serve 15 companies without ever reaching the fallback.
    for (const f of fakes) expect(f, "repli suffixé atteint").not.toMatch(/-\d+$/);
    // No root serving two identities (the fakeWordIndex invariant).
    const seen = new Map<string, string>();
    for (let i = 0; i < fakes.length; i++) {
      for (const w of distinctive(fakes[i])) {
        expect(
          seen.has(w) ? `« ${w} » sert ${seen.get(w)} ET ${COMPANIES[i]}` : "",
          "mot distinctif partagé",
        ).toBe("");
        seen.set(w, COMPANIES[i]);
      }
    }
  });

  it("jamais deux fakes ne différant que par la CASSE pour deux réels distincts", async () => {
    // « SCI Les Tilleuls » → « BRANTLEY Systems » while « Transports Bodin » →
    // « Brantley Systems »: a model echo with normalized casing then un-redacts
    // to the WRONG company. This pair must no longer be able to exist.
    for (const salt of [0, 42, 2 ** 30 + 7]) {
      const vault = await fakeDocument(COMPANIES, salt);
      const byLower = new Map<string, string>();
      for (const [fake, real] of Object.entries(vault)) {
        const low = fake.toLowerCase();
        const prev = byLower.get(low);
        expect(
          prev !== undefined && prev !== real ? `« ${fake} » (${real}) vs (${prev})` : "",
          `salt ${salt}: jumeaux de casse`,
        ).toBe("");
        if (prev === undefined) byLower.set(low, real);
      }
    }
  });
});

describe("fakeOrg — le vivier et son exploration", () => {
  it("les 60 tentatives explorent réellement le vivier (pas 1-3 noms par longueur)", () => {
    // Before: exact-length pool → h+101·a modulo 1-3 candidates, 60 attempts for
    // ≤3 names. Growing tolerance must reach dozens of them.
    const seen = new Set<string>();
    for (let a = 0; a < 60; a++) seen.add(fakeFor("ORG", "Cabinet Verland", a, undefined, 0));
    expect(seen.size).toBeGreaterThanOrEqual(25);
  });

  it("le salt fait varier le fake MÊME pour une longueur autrefois à candidat unique", () => {
    // « Cabinet Verland » (15 chars) used to receive « Delvane Systems » in 10 out of
    // 10 conversations: a single 15-char name in the old pool — the salt had no effect,
    // and the fake was a stable fingerprint of the real value's length.
    const seen = new Set<string>();
    for (let s = 0; s < 12; s++) seen.add(fakeFor("ORG", "Cabinet Verland", 0, undefined, s * 7919 + 13));
    expect(seen.size).toBeGreaterThanOrEqual(3);
  });

  it("attempt 0 reste au plus près de la longueur du réel (l'indice de taille tient)", () => {
    for (const value of ["Studio Karma", "Groupe Balmont", "Voxatel Média"]) {
      const fake = fakeFor("ORG", value, 0, undefined, 0);
      expect(Math.abs(fake.length - value.length), `${value} → ${fake}`).toBeLessThanOrEqual(1);
    }
  });
});

describe("le vivier combinatoire respecte ses deux contrats", () => {
  it("toute combinaison multi-mots FINIT par un suffixe que le garde anti-fragments reconnaît", () => {
    // `buildFakeFragments` only indexes a fake as a company if it ends with a word
    // from GENERIC_ORG_WORD — an unknown suffix would silently disconnect the
    // anti "fake-of-a-fake" guard for all its combinations.
    for (const suffix of ORG_SUFFIXES.filter(Boolean)) {
      const last = suffix.trim().split(/\s+/).pop()!.toLowerCase();
      expect(GENERIC_ORG_WORD.has(last), `suffixe « ${suffix} » inconnu d'orgFragments`).toBe(true);
    }
    const fragments = buildFakeFragments(["Torvel Systems", "Quillon & Co"]);
    expect(fragments.has("Torvel")).toBe(true);
    expect(fragments.has("Quillon")).toBe(true);
  });

  it("aucune racine n'évoque une marque célèbre, réelle ou fictive", () => {
    // Same ban as fakes.test.ts, applied to the ROOTS (the source of the 640 names).
    const FAMOUS = [
      "acme", "hooli", "globex", "initech", "soylent", "umbrella", "cyberdyne",
      "aperture", "tyrell", "oscorp", "wonka", "gringotts", "nakatomi", "stark",
      "wayne", "weyland", "yutani", "pied piper", "black mesa", "vandelay",
    ];
    for (const root of ORG_ROOTS) {
      const low = root.toLowerCase();
      for (const famous of FAMOUS) expect(low, root).not.toContain(famous);
    }
    // And one root = ONE identity (fakeWordIndex): no duplicate folded root.
    expect(new Set(ORG_ROOTS.map(fold)).size).toBe(ORG_ROOTS.length);
    // The pool's order carries meaning (pick = hash % length): root-major, stable.
    expect(FAKE_ORG.length).toBe(ORG_ROOTS.length * ORG_SUFFIXES.length);
    expect(FAKE_ORG[0]).toBe(ORG_ROOTS[0]);
  });
});
