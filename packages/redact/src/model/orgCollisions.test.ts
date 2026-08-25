import { describe, expect, it } from "vitest";
import { pseudonymize, unredact } from "../index";
import type { Vault } from "../types";
import { fakeFor } from "./fakes";
import { FAKE_ORG, ORG_ROOTS, ORG_SUFFIXES } from "./fakes/pools";
import { GENERIC_ORG_WORD, buildFakeFragments } from "./orgFragments";

/**
 * Régression de l'audit « recoupage d'entreprises » : un document multi-sociétés
 * produisait « BRANTLEY Systems » / « Brantley Systems » / « Brantley Systems-2/-3/-4 »
 * pour CINQ sociétés réelles différentes — le vivier par longueur exacte n'offrait que
 * 1-3 candidats, tout cascadait dans le repli suffixé, et ce repli vérifiait `taken` en
 * case-sensitive sans consulter le garde-mots. Un modèle qui normalise la casse d'un
 * écho faisait alors restituer la MAUVAISE société par `unredact`.
 */

/** Les mots distinctifs d'un fake (même pliage que `fakeWordIndex`). */
const fold = (w: string) => w.normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase();
const distinctive = (fake: string): string[] =>
  (fake.match(/\p{L}[\p{L}\p{M}'’-]*/gu) ?? [])
    .map(fold)
    .filter((w) => w.length >= 3 && !GENERIC_ORG_WORD.has(w));

/** Le doc de l'audit : 15 sociétés, dont 5 de même longueur (16 caractères). */
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
  expect(unredact(text, vault)).toBe(input); // réversible, toujours
  return vault;
}

describe("collisions d'entreprises — un document, N sociétés", () => {
  it("15 sociétés → 15 bases sans AUCUN mot distinctif partagé, zéro repli suffixé", async () => {
    const vault = await fakeDocument(COMPANIES, 987654321);
    const fakes = COMPANIES.map(
      (c) => Object.entries(vault).find(([, real]) => real === c)![0],
    );
    // Plus jamais « Brantley Systems-2 » : le vivier combinatoire + la tolérance de
    // longueur doivent servir 15 sociétés sans jamais atteindre le repli.
    for (const f of fakes) expect(f, "repli suffixé atteint").not.toMatch(/-\d+$/);
    // Aucune racine au service de deux identités (l'invariant du fakeWordIndex).
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
    // « SCI Les Tilleuls » → « BRANTLEY Systems » pendant que « Transports Bodin » →
    // « Brantley Systems » : un écho du modèle à la casse normalisée se un-redacted
    // alors vers la MAUVAISE société. La paire ne doit plus pouvoir exister.
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
    // Avant : pool par longueur exacte → h+101·a modulo 1-3 candidats, 60 essais pour
    // ≤3 noms. La tolérance croissante doit en atteindre des dizaines.
    const seen = new Set<string>();
    for (let a = 0; a < 60; a++) seen.add(fakeFor("ORG", "Cabinet Verland", a, undefined, 0));
    expect(seen.size).toBeGreaterThanOrEqual(25);
  });

  it("le salt fait varier le fake MÊME pour une longueur autrefois à candidat unique", () => {
    // « Cabinet Verland » (15 car) recevait « Delvane Systems » dans 10 conversations
    // sur 10 : un seul nom de 15 dans l'ancien vivier — le salt n'avait aucun effet,
    // et le fake était une empreinte stable de la longueur du réel.
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
    // `buildFakeFragments` n'indexe un fake comme entreprise que s'il finit par un mot
    // de GENERIC_ORG_WORD — un suffixe inconnu débrancherait silencieusement le garde
    // anti « fake-of-a-fake » pour toutes ses combinaisons.
    for (const suffix of ORG_SUFFIXES.filter(Boolean)) {
      const last = suffix.trim().split(/\s+/).pop()!.toLowerCase();
      expect(GENERIC_ORG_WORD.has(last), `suffixe « ${suffix} » inconnu d'orgFragments`).toBe(true);
    }
    const fragments = buildFakeFragments(["Torvel Systems", "Quillon & Co"]);
    expect(fragments.has("Torvel")).toBe(true);
    expect(fragments.has("Quillon")).toBe(true);
  });

  it("aucune racine n'évoque une marque célèbre, réelle ou fictive", () => {
    // Même interdit que fakes.test.ts, appliqué aux RACINES (la source des 640 noms).
    const FAMOUS = [
      "acme", "hooli", "globex", "initech", "soylent", "umbrella", "cyberdyne",
      "aperture", "tyrell", "oscorp", "wonka", "gringotts", "nakatomi", "stark",
      "wayne", "weyland", "yutani", "pied piper", "black mesa", "vandelay",
    ];
    for (const root of ORG_ROOTS) {
      const low = root.toLowerCase();
      for (const famous of FAMOUS) expect(low, root).not.toContain(famous);
    }
    // Et une racine = UNE identité (fakeWordIndex) : pas de doublon de racine pliée.
    expect(new Set(ORG_ROOTS.map(fold)).size).toBe(ORG_ROOTS.length);
    // L'ordre du vivier est porteur (pick = hash % length) : root-major, stable.
    expect(FAKE_ORG.length).toBe(ORG_ROOTS.length * ORG_SUFFIXES.length);
    expect(FAKE_ORG[0]).toBe(ORG_ROOTS[0]);
  });
});
