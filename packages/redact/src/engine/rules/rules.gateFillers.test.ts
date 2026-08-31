import { describe, expect, it } from "vitest";
import { redact } from "../../index";

// gate()'s LINKING-WORDS tolerance — the conversational turn every gated family
// leaked on (« le passeport du titulaire porte le numéro … ») versus the bounds
// that keep it from crossing a clause. The adversarial battery of 2026-07 is the
// source of every case here.
const out = (t: string): string => redact(t, {}).text;
const redacted = (t: string, v: string): boolean =>
  !out(t).includes(v) && /\[REDACTED_[A-Z_]+_\d+\]/.test(out(t));

describe("gate() — linking words between keyword and value", () => {
  const positives: Array<[string, string, string]> = [
    ["SIREN + « de la société est »", "le numéro SIREN de la société est 863471587", "863471587"],
    ["passeport + 5 mots", "le passeport du titulaire porte le numéro 12AB34567", "12AB34567"],
    ["CAF + ville capitalisée", "mon numéro d'allocataire à la CAF de Nantes est le 1234567", "1234567"],
    ["AGDREF + prose", "le numéro étranger figurant sur son titre est 7512345678", "7512345678"],
    ["BSN + copule NL", "het BSN van de aanvrager is 845392864", "845392864"],
    ["IMEI + prose", "l'IMEI gravé au dos du téléphone volé : 490154203237518", "490154203237518"],
    ["SSN + « of record »", "SSN of record: 219-09-9999", "219-09-9999"],
    ["EIN + prose", "the EIN reported on the form is 84-3172906", "84-3172906"],
  ];
  for (const [name, text, value] of positives) {
    it(`franchit les mots de liaison — ${name}`, () => {
      expect(redacted(text, value)).toBe(true);
    });
  }

  it("un CHIFFRE dans la zone de liaison bloque le pont (un montant n'est pas un mot)", () => {
    expect(out("la CAF a versé 1 200 € puis 1234567 unités")).toContain("1234567");
    expect(out("sa carte d'identité (celle délivrée en 2019) porte le n° 990234567")).toContain(
      "990234567",
    );
  });

  it("au-delà de 5 mots de liaison, le mot-clé perd son autorité", () => {
    expect(out("her NHS number, as printed on the letter that arrived, is 4010232137")).toContain(
      "4010232137",
    );
  });

  it("une plage de dates après « référence » reste en clair (lettre exigée au segment médian)", () => {
    expect(out("référence du 12/05/2024 au 30/06/2024")).toContain("12/05/2024");
    expect(redacted("Dossier : 2026/BM/44127", "2026/BM/44127")).toBe(true);
  });

  it("sans mot-clé, les mêmes formes restent en clair (le plancher de précision tient)", () => {
    expect(out("lot 1234567 expédié en 7512345678 exemplaires")).toContain("1234567");
    expect(out("le rôle de chacun est décrit au chapitre 3")).toContain("rôle de chacun");
  });
});

describe("gate() — le mot-clé COLLÉ au mot suivant par l'OCR (16/08/2026)", () => {
  /** Measured on a REAL assembly minutes: the extracted text reads « RCSCréteil 701 452 006 »
   *  where the page prints « RCS Créteil ». The SIREN was leaving IN CLEAR — whereas the same
   *  spaced line redacts it. A SIREN converts into a company name via a search
   *  in the public registry: leaving it means masking nothing. */
  it("un SIREN reste redacted quand l'OCR soude le mot-clé à la ville", () => {
    expect(redacted("SAS au capital de 6400 euros -RCSCréteil 701 452 006", "701 452 006")).toBe(true);
    // …and the spaced form hasn't moved.
    expect(redacted("SAS au capital de 6400 euros - RCS Créteil 701 452 006", "701 452 006")).toBe(true);
  });

  it("UN seul mot soudé — au-delà c'est une phrase, pas une soudure", () => {
    // The branch requires separators AFTER the glued word: it can't chain further.
    expect(out("RCSCréteilaprèsplusieursmotssanslimite 701 452 006")).toContain("701 452 006");
  });

  it("le plancher de précision tient : un mot qui COMMENCE par un mot-clé ne gate pas", () => {
    expect(out("le nirvana 701 452 006")).toContain("701 452 006");
  });
});

describe("gate() — un mot-clé CJK n'a AUCUN `\\b` devant lui (16/08/2026)", () => {
  /** Measured on the bench of personas outside France, on a VALID number: the English
   *  label redacts, the Japanese ones don't. The leading `\b` rested on an assumption —
   *  "every context word starts with an ASCII letter" — that became false once
   *  the vocabulary took on CJK words. No rule gated by an ideogram could
   *  therefore fire. */
  it("le numéro national japonais est redacted sous SON étiquette", () => {
    expect(redacted("My Number 8465 2198 7037", "8465 2198 7037")).toBe(true);
    expect(redacted("マイナンバー 8465 2198 7037", "8465 2198 7037")).toBe(true);
    expect(redacted("個人番号 8465 2198 7037", "8465 2198 7037")).toBe(true);
    // …and glued to the Japanese text, which has no spaces.
    expect(redacted("従業員：田中太郎、マイナンバー 846521987037、基本給", "846521987037")).toBe(true);
  });

  it("⚠️ et la protection d'origine tient : un SUFFIXE de mot ne garde rien", () => {
    // `(?<![A-Za-z0-9_])` says the same thing as `\b` for a keyword with an ASCII initial.
    expect(out("xxmy number 8465 2198 7037")).toContain("8465 2198 7037");
  });

  it("…et un numéro INVALIDE reste en clair, quelle que soit l'étiquette", () => {
    // The precision bar: the guard opens, the checksum decides.
    expect(out("マイナンバー 123456789012")).toContain("123456789012");
  });
});
