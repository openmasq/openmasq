import { describe, expect, it } from "vitest";
import { redact } from "../../index";
import { nirSpacedDistinct } from "./rules.france";

// Same harness as rules.international.test.ts: drive the REAL engine (marker mode)
// so ordering/overlap with card/IBAN/phone is exercised too.
function out(text: string): string {
  return redact(text, {}).text;
}
function redacted(text: string, value: string): boolean {
  const o = out(text);
  return !o.includes(value) && /\[REDACTED_[A-Z_]+_\d+\]/.test(o);
}

describe("NIR — as actually written (spaced groups, Corse, optional key)", () => {
  it("redacts the canonical SPACED form, with and without its key", () => {
    expect(redacted("NIR : 1 65 03 18 742 596 90", "1 65 03 18 742 596 90")).toBe(true);
    expect(redacted("Sécu 2 95 07 75 120 005 sur la carte.", "2 95 07 75 120 005")).toBe(true);
  });

  it("redacts a Corsican NIR (2A/2B département), spaced or glued", () => {
    expect(redacted("NIR 1 84 03 2A 120 005 12 fin.", "1 84 03 2A 120 005 12")).toBe(true);
    expect(redacted("num 295072B00401288 fin.", "295072B00401288")).toBe(true);
  });

  it("still redacts the legacy GLUED 15-digit form", () => {
    expect(redacted("insee 165031874259690 ok", "165031874259690")).toBe(true);
  });

  it("does NOT grab a bare 13-digit run (epoch-milliseconds collision)", () => {
    // "1650318742596" parses as sex 1 / year 73 / month 02 — but it's a timestamp.
    expect(out('{"created": 1650318742596}')).toContain("1650318742596");
  });

  it("nirSpacedDistinct — the guard's three accepted shapes, and the rejection", () => {
    expect(nirSpacedDistinct("1 84 03 75 120 005")).toBe(true); // separators
    expect(nirSpacedDistinct("184032A12000512")).toBe(true); // Corse letters
    expect(nirSpacedDistinct("165031874259690")).toBe(true); // full 15 digits
    expect(nirSpacedDistinct("1650318742596")).toBe(false); // bare 13 = timestamp
  });
});

describe("French identity documents — context-gated schemes", () => {
  it("passeport: gated on the document word, never bare", () => {
    expect(redacted("Passeport n° 12AB34567 délivré le…", "12AB34567")).toBe(true);
    expect(out("réf commande 12AB34567 expédiée")).toContain("12AB34567");
  });

  it("CNI: old 12-digit and new 9-alnum document numbers, gated (both apostrophes)", () => {
    expect(redacted("Carte d'identité n° 123456789012", "123456789012")).toBe(true);
    expect(redacted("Carte d’identité : X4RTBPFW4", "X4RTBPFW4")).toBe(true);
    expect(redacted("CNI : X4RTBPFW4", "X4RTBPFW4")).toBe(true);
    // Bare, the 9-alnum is NOT a national id (the generic token rule may still claim
    // an interleaved-alnum code — that's its own territory, not this gate's).
    expect(out("le colis X4RTBPFW4 est arrivé")).not.toContain("NATIONAL_ID");
    expect(out("carte d'identité : PERSONNELS")).toContain("PERSONNELS");
  });

  it("permis de conduire: 12 alnum with a digit, gated", () => {
    expect(redacted("Permis de conduire n° 81AB12345678", "81AB12345678")).toBe(true);
    expect(out("suivi colis 81AB12345678 en route")).toContain("81AB12345678");
  });

  it("titre de séjour / AGDREF: 9-10 digits, gated", () => {
    expect(redacted("Titre de séjour n° 9912345678 valable…", "9912345678")).toBe(true);
    expect(out("facture 9912345678 payée")).toContain("9912345678");
  });
});

describe("EUID (K-bis) — the register segment defeated the SIREN gate", () => {
  it("redacts a labeled EUID whole, whatever the country form", () => {
    for (const [text, value] of [
      ["EUID : FR.RCS.PA.775 384 225 au registre", "FR.RCS.PA.775 384 225"],
      ["N° EUID FRRCS.775384225 enregistré", "FRRCS.775384225"],
      ["EUID: DEK1101R.HRB147936 eingetragen", "DEK1101R.HRB147936"],
    ] as const) {
      const o = out(text);
      expect(o).not.toContain(value);
      expect(o).toContain("COMPANY_ID");
    }
  });

  it("the French forms fire BARE on the embedded SIREN's last-9 Luhn", () => {
    expect(redacted("immatriculée FR.RCS.775384225 depuis 1990", "FR.RCS.775384225")).toBe(true);
    // The REAL K-bis wire form: FR + 4-digit greffe code + "." + SIREN (reported miss —
    // a whole-string Luhn saw 13 digits and always failed).
    expect(redacted("immatriculée FR7501.863471587 au greffe", "FR7501.863471587")).toBe(true);
    expect(redacted("EUID FR7501.863 471 587 déposé", "FR7501.863 471 587")).toBe(true);
    // A wrong embedded SIREN (Luhn fails) is left alone by the bare rule.
    expect(out("réf FR2026.123456780 interne")).toContain("FR2026.123456780");
  });

  it("a digitless value after the label never matches", () => {
    expect(out("EUID : voir le document joint")).toContain("voir le document joint");
  });
});

describe("SIREN/SIRET — keyword on EITHER side, no checksum demand (OCR'd digits)", () => {
  it("redacts the number-BEFORE-keyword legal form ('… 850 861 036 RCS Mulhouse')", () => {
    // 850861036 FAILS Luhn on purpose (a misread digit) — keyword + structure suffice.
    expect(redacted("Société Civile - 850 861 036 RCS Mulhouse", "850 861 036")).toBe(true);
  });

  it("redacts the FULL 14-digit SIRET behind its keyword even when Luhn fails", () => {
    // The old Luhn gate salvaged only the 9-digit SIREN prefix and LEAKED the NIC tail.
    expect(redacted("N° SIRET 631 825 941 22 761 N° TVA", "631 825 941 22 761")).toBe(true);
  });

  it("a bare 9-digit run with NO scheme keyword stays in clear", () => {
    expect(out("total de 123 456 789 unités vendues")).toContain("123 456 789");
  });
});

describe("TVA intracommunautaire — keyword path, no Luhn demand (mirrors SIREN)", () => {
  it("redacts a glued, Luhn-invalid TVA behind its keyword — the SIREN inside must not leak", () => {
    // Seen (accountant walkthrough 13/08): « TVA intracom FR00 753816290 » was going out
    // VERBATIM (frVat requires a Luhn check on the embedded SIREN) while « SIREN 842 519 763 »
    // was masked three lines above, deliberately without Luhn — the SAME digits, two
    // standards, and the real SIREN reconstructible in clear inside the TVA.
    const o = out("dossier (SIREN 842 519 763, TVA intracom FR00 753816290)");
    expect(o).not.toContain("FR00 753816290");
    // WHOLE masking — the faulty span « intracom FR37 84 » left « 2519763 » in
    // clear behind the token, and « intracom » (an ordinary word) was going out redacted.
    expect(o).not.toContain("2519763");
    expect(o).toContain("intracom");
  });
  it("keyword before the FR-form, ordinary prose gap, still redacts — without eating the next word", () => {
    const o = out("n° TVA FR00 753816290 de la société");
    expect(o).not.toContain("FR00 753816290");
    // The greedy {8,12} was swallowing "d": "e la société" was left orphaned on screen.
    expect(o).toContain("de la société");
  });
  it("shape-only (no keyword) keeps the double-checksum bar — Luhn-invalid stays clear", () => {
    expect(out("réf FR00 753816290 au dossier")).toContain("FR00 753816290");
  });
});

describe("MRZ — la bande machine d'une pièce d'identité", () => {
  // The OCR-B band carries NAME, first names, encoded date and number — fused with chevrons.
  // As soon as OCR reads it (targeted re-read `ocr/garbled.ts`), it MUST be masked:
  // no other rule sees a name fused into « IDFRADUPONT<<< ». Distinctive shape
  // (≥25 characters of [A-Z0-9<] including ≥4 chevrons) — nothing ordinary looks like it.
  it("masque les deux lignes d'une CNI, la ligne nom et la ligne numéro+date", () => {
    expect(
      redacted("IDFRADUPONTMARTIN<<<<<<<<<<<<<<353113 fin", "IDFRADUPONTMARTIN<<<<<<<<<<<<<<353113"),
    ).toBe(true);
    expect(
      redacted("1403353002722JEAN<<LUC<9609233M8 bas de carte", "1403353002722JEAN<<LUC<9609233M8"),
    ).toBe(true);
  });
  it("ne touche ni au code, ni aux heredocs, ni aux chevrons de prose", () => {
    for (const t of ["std::cout << \"BONJOUR\" << std::endl;", "cat <<'EOF' puis EOF", "AAAA<BBBB<CCCC"]) {
      expect(out(t)).toBe(t);
    }
  });
});

describe("CRPCEN — the notary-office registry number", () => {
  it("redacts the number behind its keyword", () => {
    expect(redacted("identifié sous le numéro CRPCEN 95079,", "95079")).toBe(true);
  });
  it("a bare 5-digit run without the keyword stays in clear", () => {
    expect(out("il y avait 95079 visiteurs")).toContain("95079");
  });
});

describe("NBSP / narrow-NBSP digit grouping (French typographic PDFs)", () => {
  // U+00A0 and U+202F are THE French digit-group separators PDF extraction emits;
  // a rule matching only [ ] shipped every such number in clear.
  it("SIREN grouped with no-break spaces still redacts", () => {
    expect(redacted("N° SIRET 512 704 838 immatriculée", "512 704 838")).toBe(true);
  });
  it("TVA grouped with narrow no-break spaces still redacts (labeled path)", () => {
    expect(
      redacted("TVA intracommunautaire : FR 16 512 704 838", "FR 16 512 704 838"),
    ).toBe(true);
  });
  it("a fully LETTER-SPACED NIR (OCR) redacts; a random spaced column does not", () => {
    expect(redacted("Sécu : 1 8 4 0 3 7 5 1 2 0 0 0 5 1 2 fin", "1 8 4 0 3 7 5 1 2")).toBe(true);
    // month "13" is impossible → not a NIR, digits stay (no FP on spaced columns)
    expect(out("total 1 7 7 1 3 7 5 1 2 0 0 0 5 1 2 fin")).toContain("1 7 7 1 3 7 5 1 2 0 0 0 5 1 2");
  });
});

describe("PDL / PRM — energy delivery point (14 digits, gated)", () => {
  it("redacts behind its keyword, parenthesised acronym included", () => {
    expect(redacted("Votre point de livraison (PDL) : 12 345 678 901 234", "12 345 678 901 234")).toBe(true);
    expect(redacted("PRM 12345678901234 sur votre facture", "12345678901234")).toBe(true);
  });
  it("a bare 14-digit run without the keyword stays in clear", () => {
    expect(out("référence commande 12345678901239 expédiée")).toContain("12345678901239");
  });
});

describe("avis d'impôt — les références du bloc en tête", () => {
  // Only « Numéro fiscal » was covered (digits only). The others carry a group of
  // LETTERS (« 20 35 A195936 32 »), so no numeric rule could see them: they
  // were going out in clear on every tax notice, property tax and housing tax bill.
  it("redacted FIP, référence de l'avis, rôle et numéro d'occupant", () => {
    expect(redacted("Numéro FIP :      350 54 32 4525937789 3", "350 54 32 4525937789 3")).toBe(true);
    expect(redacted("Référence de l'avis :   20 35 A195936 32", "20 35 A195936 32")).toBe(true);
    expect(redacted("Rôle : 21 / 0123456 / 45", "21 / 0123456 / 45")).toBe(true);
    expect(redacted("Numéro d'occupant : 12 3456 78", "12 3456 78")).toBe(true);
  });

  it("« rôle » reste un mot ordinaire — c'est la FORME de la valeur qui décide", () => {
    // The label opens the rule, it doesn't close it: without a grouped value, in
    // uppercase and with ≥4 digits, nothing is redacted.
    expect(out("le rôle de chacun est défini dans la convention")).toContain("chacun");
    expect(out("Rôle : responsable des achats")).toContain("responsable");
  });

  it("la référence ne franchit pas une gouttière de colonnes", () => {
    // A spacing of 2+ is a neighboring column, not the continuation of the reference.
    expect(out("FIP 350 54 32 4525937789 3     Autre colonne")).toContain("Autre colonne");
  });
});

describe("« RC » (ancien registre du commerce) + carte professionnelle CPI", () => {
  it("« RC 424613305 » : mot-clé adjacent + Luhn SIREN = company_id", () => {
    // Luhn-valid vector (the one from the doc9-appel-fonds corpus).
    expect(redacted("CABINET X\nRC 424613305 CODE APE 703 C", "424613305")).toBe(true);
  });

  it("un numéro à 9 chiffres qui RATE son Luhn reste en clair derrière « RC »", () => {
    // Bare « RC » is ambiguous (civil liability) — without a checksum, no traction.
    expect(out("attestation RC 123456789 fournie au bailleur")).toContain("123456789");
  });

  it("« CPI 6902 2018 000 024 618 » : la forme 4-4-3-3-3 derrière son mot-clé", () => {
    expect(redacted("Carte prof. CPI 6902 2018 000 024 618 délivrée", "6902 2018 000 024 618")).toBe(true);
  });

  it("la même forme SANS le mot-clé reste en clair (pas de prise sur la forme seule)", () => {
    expect(out("total 6902 2018 000 024 618 sur la période")).toContain("6902 2018 000 024 618");
  });
});
