import { describe, it, expect } from "vitest";
import { detectPhones, isValidIntlPhone } from "./phones";
import { detectLabeledFields } from "./contextFields";
import { detectAddresses } from "./addresses";
import { pseudonymize } from "../model/pseudonymize";

describe("detectPhones (libphonenumber)", () => {
  it("finds validated international numbers across countries, verbatim", () => {
    const t = "FR +33 6 12 34 56 78, US +1 (415) 555-0132, UK +44 7911 123456";
    const vals = detectPhones(t).map((p) => p.value);
    expect(vals).toContain("+33 6 12 34 56 78");
    expect(vals).toContain("+1 (415) 555-0132");
    expect(vals).toContain("+44 7911 123456");
  });

  it("does NOT flag random digit runs (SIRET, amounts)", () => {
    expect(detectPhones("réf 2022B44821 montant +1 234 567 €")).toEqual([]);
  });

  it("returns [] fast when there is no + sign", () => {
    expect(detectPhones("appelle le 0612345678")).toEqual([]);
  });
});

describe("isValidIntlPhone (rules.ts international-phone gate)", () => {
  it("rejects 00-prefixed digit runs that are NOT dialable numbers", () => {
    // The exact false positives the loose regex used to redact: references,
    // codes, year ranges — none are real phone numbers.
    for (const fp of ["00260520", "009123238", "008-2014", "008-2019", "009-2026", "001800"]) {
      expect(isValidIntlPhone(fp)).toBe(false);
    }
  });

  it("accepts real international numbers (+ or 00 prefix, any separators)", () => {
    for (const ok of [
      "+33 6 12 34 56 78",
      "0033612345678",
      "+1 415 555 0132",
      "00447911123456",
    ]) {
      expect(isValidIntlPhone(ok)).toBe(true);
    }
  });
});

describe("detectLabeledFields (multilingual label → value)", () => {
  it("flags the value of a sensitive field label, in several languages", () => {
    const found = detectLabeledFields(
      [
        "Dénomination : Karl Studio",
        "Name: John Welby",
        "Dirección: Calle Mayor 3",
        "Téléphone : 06 12 34 56 78",
        "Ville : Lyon",
      ].join("\n"),
    );
    const byCat = Object.fromEntries(found.map((d) => [d.value, d.category]));
    expect(byCat["Karl Studio"]).toBe("ORG");
    expect(byCat["John Welby"]).toBe("NAME");
    expect(byCat["Calle Mayor 3"]).toBe("ADDRESS");
    expect(byCat["06 12 34 56 78"]).toBe("PHONE");
    expect(byCat["Lyon"]).toBe("CITY");
  });

  it("does not fire on a non-sensitive label or an empty/placeholder value", () => {
    expect(detectLabeledFields("Objet : réunion budget")).toEqual([]);
    expect(detectLabeledFields("Nom : N/A")).toEqual([]);
  });

  it("stops the value at the next field on the same line", () => {
    const found = detectLabeledFields("Nom : Rebour    Ville : Paris");
    const nom = found.find((d) => d.category === "NAME");
    expect(nom?.value).toBe("Rebour");
  });
});

describe("detectAddresses (multilingual street + postal)", () => {
  const cat = (t: string) =>
    Object.fromEntries(detectAddresses(t).map((d) => [d.value, d.category]));

  it("catches street addresses across the 4 language shapes", () => {
    expect(cat("36 AV DU CAPITAINE GLARNER")["36 AV DU CAPITAINE GLARNER"]).toBe("ADDRESS"); // FR
    expect(cat("Calle Mayor 3")["Calle Mayor 3"]).toBe("ADDRESS"); // ES
    expect(cat("Via Roma 12")["Via Roma 12"]).toBe("ADDRESS"); // IT
    expect(cat("221 Baker Street")["221 Baker Street"]).toBe("ADDRESS"); // EN
    expect(cat("Musterstraße 12")["Musterstraße 12"]).toBe("ADDRESS"); // DE
  });

  it("captures a FR postal code + city as ONE coherent PLACE", () => {
    // CP + city are now one span (so they get faked from the SAME real place),
    // incl. hyphenated + ALL-CAPS cities. The city is NOT left to the NER anymore.
    expect(cat("35136 Saint-Jacques-de-la-Lande")["35136 Saint-Jacques-de-la-Lande"]).toBe("PLACE");
    expect(cat("92240 MALAKOFF")["92240 MALAKOFF"]).toBe("PLACE");
    expect(cat("37000 Tours")["37000 Tours"]).toBe("PLACE");
    expect(cat("93400 ST OUEN")["93400 ST OUEN"]).toBe("PLACE");
    // A UK alphanumeric code still fires as POSTAL_CODE.
    expect(cat("London NW1 6XE")["NW1 6XE"]).toBe("POSTAL_CODE");
  });

  it("captures a street + CP + city as ONE address, no over-capture; a bare CP+city stays a PLACE", () => {
    const dets = detectAddresses("4 rue Louis Braille-35136 Saint-Jacques-de-la-Lande - 775590847 RCS Rennes");
    const addr = dets.find((d) => d.category === "ADDRESS");
    expect(addr).toBeTruthy();
    expect(addr!.value).toContain("35136"); // the code is part of the (one) address span…
    expect(dets.every((d) => !/RCS|775590847/.test(d.value))).toBe(true); // …and it stops before the next block
    // A bare "CP Ville" (no street on the line) is still a standalone coherent PLACE.
    expect(cat("92240 MALAKOFF France")["92240 MALAKOFF"]).toBe("PLACE"); // stops before "France"
  });

  it("falls back to POSTAL_CODE only when no capturable city follows", () => {
    // A lowercase word after the code is not a city → no PLACE, no leak.
    expect(detectAddresses("12345 items").some((d) => d.category === "PLACE")).toBe(false);
  });

  it("does not flag bare numbers with no street/place signal", () => {
    expect(detectAddresses("j'ai 3 pommes et 12 idées, 12345 items")).toEqual([]);
  });

  it("catches CJK addresses (CN/JP/KR) + JP postal, no FP on prose", () => {
    expect(cat("北京市朝阳区建国路88号")["北京市朝阳区建国路88号"]).toBe("ADDRESS"); // CN
    expect(cat("東京都渋谷区神南1-2-3")["東京都渋谷区神南1-2-3"]).toBe("ADDRESS"); // JP
    expect(cat("서울특별시 강남구 테헤란로 152")["서울특별시 강남구 테헤란로 152"]).toBe("ADDRESS"); // KR
    expect(cat("〒150-0041 東京都")["〒150-0041"]).toBe("POSTAL_CODE"); // JP postal
    expect(detectAddresses("会議は火曜日です")).toEqual([]); // prose, no FP
  });

  /**
   * ⚠️ HALF-PROTECTION IS WORSE THAN NONE — reported on 11/08.
   *
   * The BARE `NNN-NNNN` form of the Japanese postal code claimed the tail of any
   * North-American number: « +1 (555) 123-4567 » came out as « +1 (555) 864-2086 », the
   * area code left in clear under a value that looked redacted. It now requires a
   * Japanese context; the 〒 marker, on its own, is enough (it's distinctive).
   */
  it("le code postal JP nu exige un contexte japonais — jamais la queue d'un téléphone", () => {
    expect(detectAddresses("Appelle le +1 (555) 123-4567 demain")).toEqual([]);
    expect(detectAddresses("Commande 123-4567 expédiée")).toEqual([]);
    // The marker stays distinctive with no other context at all…
    expect(cat("〒150-0041")["〒150-0041"]).toBe("POSTAL_CODE");
    // …and the bare form comes back as soon as the text is Japanese.
    expect(cat("東京都渋谷区 150-0041")["150-0041"]).toBe("POSTAL_CODE");
  });
});

describe("detectLabeledFields — CJK labels", () => {
  it("flags the value of a CJK field label (ZH/JP/KR)", () => {
    const found = detectLabeledFields(
      ["会社名：ソニー株式会社", "氏名：田中太郎", "住所：東京都渋谷区", "이름: 김민준"].join("\n"),
    );
    const byCat = Object.fromEntries(found.map((d) => [d.value, d.category]));
    expect(byCat["ソニー株式会社"]).toBe("ORG");
    expect(byCat["田中太郎"]).toBe("NAME");
    expect(byCat["東京都渋谷区"]).toBe("ADDRESS");
    expect(byCat["김민준"]).toBe("NAME");
  });
});

describe("le saut de ligne dans une adresse : toléré ancré, refusé sinon", () => {
  // The legal corpus (`bench/corpora/juridique.json`) turned this up on a judgment header:
  // « RCS Nanterre 775 384 225\ndomiciliée 4 avenue du Général Leclerc ». The forms
  // joined number/name/type with `\s`, which swallows the line break — the TAIL of the
  // RCS number fused to the HEAD of the address into a fake British street. The
  // value vaulted that way can't cleanly re-substitute either one.
  const HEADER =
    "S.A.S. TECHNIVERT, RCS Nanterre 775 384 225\ndomiciliée 4 avenue du Général Leclerc, 92100 Boulogne";

  it("ne fabrique aucune adresse à cheval sur deux lignes", () => {
    for (const d of detectAddresses(HEADER)) expect(d.value).not.toMatch(/[\r\n]/);
  });

  it("l'adresse et l'identifiant restent chacun entiers", () => {
    const values = detectAddresses(HEADER).map((d) => d.value);
    expect(values).toContain("4 avenue du Général Leclerc, 92100 Boulogne");
  });

  it("un retour ANCRÉ sur le mot-type est au contraire recouvré (scan OCR)", () => {
    // The complementary half: here, the join sits right at the word « RUE » itself — nothing
    // can slip in there, and a scan really does break there. Forbidding it cost a real address
    // from the documentsFr corpus (doc11-pv-ag-ocr).
    const values = detectAddresses("les copropriétaires de la Résidence 27\nRUE DES ORMEAUX convoqués").map(
      (d) => d.value,
    );
    expect(values.some((v) => v.includes("27\nRUE DES ORMEAUX"))).toBe(true);
  });

  it("mais un bloc postal garde le droit de se couper avant son CP", () => {
    // The ban is on the CORE (number ↔ name ↔ type), not on the tail: a
    // header address legitimately breaks onto a new line before « CP Ville ».
    const values = detectAddresses("17 rue Gabriel Péri,\n92110 Clichy").map((d) => d.value);
    expect(values.some((v) => v.includes("92110 Clichy"))).toBe(true);
  });
});

describe("code postal océrisé — borné à ≥2 vrais chiffres", () => {
  it("« 6O00O BEAUVAIS » reste un lieu, code ET ville dans le MÊME span", () => {
    // A scan renders « 60000 » as « 6O00O » (O read for zero, l/I for one). Without tolerance,
    // the code survived next to a faked city — exactly the split the joint
    // postal-code+city span exists to prevent.
    const values = detectAddresses("3l bis rue des Casernes\n6O00O BEAUVAIS").map((d) => d.value);
    expect(values.some((v) => v.includes("6O00O") && v.includes("BEAUVAIS"))).toBe(true);
  });

  it("un mot capitalisé ne peut jamais ouvrir un lieu", () => {
    // The bound (≥2 real digits) is what stops « OOlOO » from passing for a code.
    expect(detectAddresses("OOlOO Beauvais")).toEqual([]);
  });
});

describe("pseudonymize integration", () => {
  it("redacted a labelled company + an international phone the model/regex would miss", async () => {
    const vault: Record<string, string> = {};
    const r = await pseudonymize(
      "Dénomination : Karl Studio\nContact +33 6 12 34 56 78",
      { vault },
    );
    // Both the company (label) and the intl phone are now redacted.
    expect(r.text).not.toContain("Karl Studio");
    expect(r.text).not.toContain("+33 6 12 34 56 78");
    expect(Object.values(vault)).toContain("Karl Studio");
    expect(Object.values(vault)).toContain("+33 6 12 34 56 78");
  });
});

describe("la queue « CP Ville » survit à la VIRGULE du formulaire (16/08/2026)", () => {
  /** Measured on a REAL lease and its REAL amendment. Without the comma in the separator, the tail
   *  detached and the result was the worst of both worlds: the STREET went out fake
   *  while the postal code AND the city stayed TRUE — the geographic incoherence
   *  this tail exists to prevent, and an address reconstructible down to one digit. */
  it("« rue, CP, Ville » est UNE adresse, comme « rue, CP Ville »", async () => {
    for (const t of [
      "Adresse des locaux loués : 2 mail Camille du Gast, 92600, Asnières",
      "LE BAILLEUR : Mr Michel RADULESTI, 50 BD MAILLOT, 92200, NEUILLY SUR SEINE",
    ]) {
      const out = (await pseudonymize(t, { vault: {} })).text;
      expect(out).not.toContain("92600");
      expect(out).not.toContain("92200");
      expect(out).not.toContain("Asnières");
      expect(out).not.toContain("NEUILLY SUR SEINE");
    }
  });

  it("la forme sans virgule n'a pas bougé", async () => {
    const out = (await pseudonymize("2 mail Camille du Gast, 92600 Asnières", { vault: {} })).text;
    expect(out).not.toContain("92600");
    expect(out).not.toContain("Asnières");
  });
});

describe("FICHE « Problème de redaction (faux positif) » — 12/08/2026", () => {
  /** Reported by a user: « for the city of Strasbourg, the app redacted
   *  "Strasbourg et je travaille" instead of "Strasbourg" ». The connector « et » was
   *  admitted inside a city run AND could END it — so the fake erased the
   *  « et » from the sentence, and the model received mutilated text. */
  it("la prose qui suit la ville n'est ni avalée ni effacée", async () => {
    const out = (await pseudonymize(
      "J'habite au 12 rue des Lilas, 67000 Strasbourg et je travaille dans le conseil.",
      { vault: {} },
    )).text;
    expect(out).toContain("et je travaille dans le conseil");
    expect(out).not.toContain("Strasbourg");
  });

  it("…et une course ne se termine jamais sur un connecteur", async () => {
    const out = (await pseudonymize("1 rue X, 35000 Rennes sur le papier ce sera mieux", { vault: {} })).text;
    expect(out).toContain("sur le papier ce sera mieux");
  });

  it("⚠️ les VRAIS toponymes à connecteur ne bougent pas", async () => {
    for (const [t, ville] of [
      ["5 rue de la Paix, 92200 Neuilly sur Seine", "Neuilly sur Seine"],
      ["5 rue de la Paix, 92200 NEUILLY SUR SEINE", "NEUILLY SUR SEINE"],
      ["2 rue Centrale, 43000 Le Puy en Velay", "Le Puy en Velay"],
      ["1 rue X, 59650 Villeneuve-d'Ascq", "Villeneuve-d'Ascq"],
    ] as const) {
      expect((await pseudonymize(t, { vault: {} })).text).not.toContain(ville);
    }
  });

  it("un champ « Adresse : » s'arrête aussi à la fin de l'adresse", async () => {
    // Same damage via the other route: a labeled field's capture runs to the end of the
    // line, so the whole sentence went into the vault.
    const out = (await pseudonymize(
      "Adresse : 3 quai des Bateliers, 67000 Strasbourg et mon bureau est ailleurs",
      { vault: {} },
    )).text;
    expect(out).toContain("et mon bureau est ailleurs");
    expect(out).not.toContain("Strasbourg");
  });
});
