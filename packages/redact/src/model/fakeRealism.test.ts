import { describe, expect, it } from "vitest";
import { fakeFor } from "./fakes";
import { luhnCheckDigit, mod97 } from "./fakes/primitives";

/**
 * The BELIEVABILITY of fakes is a security property, not a polish: a fake that
 * no longer looks like a phone or an address invites the model to « correct » it,
 * and a corrected fake no longer de-redacts. Regressions from the Sacem-statement audit.
 */
describe("téléphone — l'indicatif et la classe survivent au redaction", () => {
  it("un mobile FR reste un mobile FR (06 → 06), séparateurs conservés", () => {
    for (const [value, prefix] of [
      ["06 47 93 82 15", "06 "],
      ["06.47.93.82.15", "06."],
      ["0647938215", "06"],
      ["01 42 68 53 00", "01 "],
    ] as const) {
      const fake = fakeFor("PHONE", value, 0, undefined, 42);
      expect(fake.startsWith(prefix), `${value} → ${fake}`).toBe(true);
      expect(fake).not.toBe(value);
      expect(fake.replace(/\d/g, "#")).toBe(value.replace(/\d/g, "#")); // layout intact
    }
  });

  it("l'indicatif pays est VERBATIM — « +33 6… » ne devient jamais « +29 9… »", () => {
    expect(fakeFor("PHONE", "+33 6 52 50 56 43", 0, undefined, 7).startsWith("+33 6")).toBe(true);
    expect(fakeFor("PHONE", "00 33 6 52 50 56 43", 0, undefined, 7).startsWith("00 33 6")).toBe(true);
    expect(fakeFor("PHONE", "+1 (415) 555-2671", 0, undefined, 7).startsWith("+1 (4")).toBe(true);
    expect(fakeFor("PHONE", "+49 30 901820", 0, undefined, 7).startsWith("+49 3")).toBe(true);
  });

  it("le même numéro sous deux graphies donne les MÊMES chiffres (seed digits-only)", () => {
    const a = fakeFor("PHONE", "06 47 93 82 15", 0, undefined, 42).replace(/\D/g, "");
    const b = fakeFor("PHONE", "06.47.93.82.15", 0, undefined, 42).replace(/\D/g, "");
    expect(a).toBe(b);
  });

  it("le salt fait varier la partie abonné — jamais le préfixe", () => {
    const s1 = fakeFor("PHONE", "06 47 93 82 15", 0, undefined, 1);
    const s2 = fakeFor("PHONE", "06 47 93 82 15", 0, undefined, 999999);
    expect(s1).not.toBe(s2);
    expect(s1.startsWith("06 ")).toBe(true);
    expect(s2.startsWith("06 ")).toBe(true);
  });
});

describe("adresse — le fake porte l'habit de l'original", () => {
  const SACEM = "225 avenue Charles de Gaulle - 92528 NEUILLY-SUR-SEINE CEDEX";

  it("tiret, ville en CAPITALES et CEDEX conservés (le relevé Sacem)", () => {
    const fake = fakeFor("ADDRESS", SACEM, 0, undefined, 42);
    expect(fake, fake).toMatch(/ - \d{5} [A-ZÀ-Ý' -]+ CEDEX$/u);
    expect(fake).not.toContain("NEUILLY");
  });

  it("une rue TOUT EN CAPITALES reste en capitales", () => {
    const fake = fakeFor("ADDRESS", "36 AV DU CAPITAINE GLARNER", 0, undefined, 42);
    expect(fake).toBe(fake.toUpperCase());
  });

  it("une adresse mixte classique garde sa forme d'origine (virgule, Title case)", () => {
    const fake = fakeFor("ADDRESS", "12 rue de la République, 69001 Lyon", 0, undefined, 42);
    expect(fake).toMatch(/^\d+ [a-z]/u); // the street stays lowercase like the original
    expect(fake).toMatch(/, \d{5} /u); // the original comma, not a dash
  });

  it("un « CP VILLE CEDEX » capturé comme PLACE garde son CEDEX", () => {
    const fake = fakeFor("PLACE", "92528 NEUILLY-SUR-SEINE CEDEX", 0, undefined, 42);
    expect(fake).toMatch(/^\d{5} [A-ZÀ-Ý' -]+ CEDEX$/u);
  });
});

describe("e-mail — le suffixe de désambiguïsation ne transporte jamais le salt", () => {
  it("les chiffres du salt par-conversation n'apparaissent pas dans le fake", () => {
    // « …savary9876@… » under salt 987654321: the first digits of the per-
    // conversation salt were printed in the wire. The salt must only ever reach the
    // output THROUGH the hash, never as digits of its own.
    const salt = 987654321;
    const fake = fakeFor("EMAIL", "tugdual.sabourdin@gmail.com", 0, undefined, salt);
    expect(fake).not.toMatch(/9876/);
    expect(fake.split("@")[0]).not.toMatch(/\d{4,}/); // never a long digit run
  });
});

describe("checksums — un fake qui échoue sa propre validation est visible", () => {
  const luhnOk = (digits: string) =>
    luhnCheckDigit(digits.slice(0, -1)) === Number(digits.slice(-1));

  it("une carte fake PASSE Luhn, garde sa forme, et diffère de l'originale", () => {
    for (const card of ["4970 1012 3456 7890", "4111111111111111", "5500-0000-0000-0004"]) {
      const fake = fakeFor("CARD", card, 0, undefined, 42);
      expect(fake.replace(/\d/g, "#"), card).toBe(card.replace(/\d/g, "#")); // layout
      expect(fake).not.toBe(card);
      expect(luhnOk(fake.replace(/\D/g, "")), `${card} → ${fake}`).toBe(true);
    }
  });

  it("un IBAN fake PASSE mod-97, garde son pays et son espacement", () => {
    for (const iban of [
      "FR76 3000 6000 0112 3456 7890 189",
      "DE89370400440532013000",
      "GB82 WEST 1234 5698 7654 32",
    ]) {
      const fake = fakeFor("IBAN", iban, 0, undefined, 42);
      expect(fake.slice(0, 2), iban).toBe(iban.slice(0, 2)); // country verbatim
      expect(fake.replace(/[A-Za-z0-9]/g, "#")).toBe(iban.replace(/[A-Za-z0-9]/g, "#"));
      expect(fake).not.toBe(iban);
      const compact = fake.replace(/\s/g, "");
      expect(mod97(compact.slice(4) + compact.slice(0, 4)), `${iban} → ${fake}`).toBe(1);
    }
  });
});

describe("dates — une date générique reste dans son époque", () => {
  it("l'année d'une date ordinaire reste à ±2 ans du réel", () => {
    for (const salt of [0, 7, 99991]) {
      const fake = fakeFor("DATE", "6 OCTOBRE 2025", 0, undefined, salt);
      const year = Number(fake.match(/\d{4}/)![0]);
      expect(Math.abs(year - 2025), fake).toBeLessThanOrEqual(2);
    }
  });

  it("une DATE DE NAISSANCE garde sa fenêtre large — l'année y est identifiante", () => {
    const fake = fakeFor("DOB", "17/05/1988", 0, undefined, 42);
    const year = Number(fake.match(/\d{4}/)![0]);
    expect(year).toBeGreaterThanOrEqual(1940);
    expect(year).toBeLessThan(2005);
  });
});

describe("IP — le premier octet reste de l'unicast plausible", () => {
  it("jamais 0, 127, ni au-delà de 223", () => {
    for (const ip of ["192.168.4.7", "8.8.8.8", "203.0.113.42"]) {
      for (const salt of [0, 3, 17, 12345]) {
        const first = Number(fakeFor("IP", ip, 0, undefined, salt).split(".")[0]);
        expect(first, `${ip} salt ${salt}`).toBeGreaterThanOrEqual(1);
        expect(first).toBeLessThanOrEqual(223);
        expect(first).not.toBe(127);
      }
    }
  });
});

describe("rues — le vivier ne se répète plus sur un même document", () => {
  it("dix adresses FR distinctes donnent au moins six rues différentes", () => {
    const streets = new Set(
      Array.from({ length: 10 }, (_, i) =>
        fakeFor("ADDRESS", `${i + 1} rue de Test${i}`, 0, undefined, 42).replace(/^\d+\s+/, ""),
      ),
    );
    expect(streets.size).toBeGreaterThanOrEqual(6);
  });

  it("le numéro de rue garde l'ordre de grandeur du réel", () => {
    const big = fakeFor("ADDRESS", "225 avenue Charles de Gaulle", 0, undefined, 42);
    expect(big.match(/^\d+/)![0]).toHaveLength(3);
    const small = fakeFor("ADDRESS", "8 rue de Lorraine", 0, undefined, 42);
    expect(Number(small.match(/^\d+/)![0])).toBeLessThan(100);
  });
});

describe("pseudo — le fake garde la silhouette du handle", () => {
  it("les classes de caractères sont préservées (plus de casse en note de rançon)", () => {
    const fake = fakeFor("USERNAME", "@tugdual", 0, undefined, 42);
    expect(fake.startsWith("@")).toBe(true);
    expect(fake.slice(1)).toMatch(/^[a-z]+$/); // the original is all lowercase
    expect(fake).not.toBe("@tugdual");
    const mixed = fakeFor("USERNAME", "@Jean_Rebour75", 0, undefined, 42);
    expect(mixed).toMatch(/^@[A-Z][a-z]+_[A-Z][a-z]+\d\d$/);
  });
});
