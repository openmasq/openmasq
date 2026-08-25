import { describe, expect, it } from "vitest";
import { redact } from "../../index";
import { frVat } from "../validators";

// Drives the REAL engine (marker mode) so ordering / overlap with the built-in
// rules is exercised too. A value is "redacted" when it no longer appears verbatim
// and a placeholder took its place; "kept" when it survives in clear.
function red(text: string): string {
  return redact(text, {}).text;
}
function redacted(text: string, value: string): boolean {
  const o = red(text);
  return !o.includes(value) && /\[REDACTED_[A-Z_]+_\d+\]/.test(o);
}
function kept(text: string, value: string): boolean {
  return red(text).includes(value);
}

describe("French intra-community VAT", () => {
  it("redacts a spaced FR VAT number WITHOUT a keyword, as ONE span (incl. FR prefix)", () => {
    expect(redacted("Facture FR 79 345 360 051 pour la société", "FR 79 345 360 051")).toBe(true);
    // the whole number is one span → its embedded SIREN doesn't survive in clear either
    expect(kept("Facture FR 79 345 360 051 pour la société", "345 360 051")).toBe(false);
  });
  it("redacts the contiguous form AND leaves the word 'intracommunautaire' in clear", () => {
    const out = redact("TVA intracommunautaire : FR29458273919.", {}).text;
    expect(out).not.toContain("FR29458273919");
    expect(out).toContain("intracommunautaire"); // was a false-positive EU-VAT match
  });
  it("the 'TVA intracommunautaire' LABEL catches a checksum-INVALID number (OCR'd digits)", () => {
    // frVat rejects it (wrong key AND non-Luhn SIREN) — the labeled form must still fire.
    expect(redacted("N° TVA intracommunautaire : FR 16 850 861 036", "FR 16 850 861 036")).toBe(true);
  });
  it("frVat validates the FR VAT key checksum", () => {
    expect(frVat("FR 79 345 360 051")).toBe(true);
    expect(frVat("FR29458273919")).toBe(true);
    expect(frVat("FR 80 345 360 051")).toBe(false); // wrong key (80 ≠ 79)
    expect(frVat("FR 79 345 360 052")).toBe(false); // SIREN fails Luhn
  });
});

describe("new detectors — device & vehicle identifiers", () => {
  it("IMEI: Luhn-valid WITH context redacts; bad-Luhn kept", () => {
    expect(redacted("IMEI 490154203237518", "490154203237518")).toBe(true);
    expect(kept("IMEI 490154203237519 (typo)", "490154203237519")).toBe(true); // fails Luhn
  });
  it("ICCID: 19-digit 89… + Luhn redacts; bad-Luhn kept", () => {
    expect(redacted("SIM 8933150319295860007", "8933150319295860007")).toBe(true);
    expect(kept("ref 8933150319295860001 end", "8933150319295860001")).toBe(true); // fails Luhn
  });
  it("IMSI: only WITH context", () => {
    expect(redacted("IMSI: 310150123456789", "310150123456789")).toBe(true);
    expect(kept("code 310150123456781 v2", "310150123456781")).toBe(true); // no ctx, not Luhn
  });
  it("VIN: valid ISO check digit redacts; wrong check-digit kept", () => {
    expect(redacted("Véhicule 1HGCM82633A004352", "1HGCM82633A004352")).toBe(true);
    expect(kept("part ABCDEFHJKLMNPRSTU here", "ABCDEFHJKLMNPRSTU")).toBe(true); // 17 chars, fails VIN checksum
  });
  it("VIN: EU VIN (any check) redacts WITH the word VIN", () => {
    expect(redacted("VIN WVWZZZ1JZXW000010", "WVWZZZ1JZXW000010")).toBe(true);
  });
});

describe("new detectors — passport MRZ & Latin-America IDs", () => {
  it("MRZ TD3 line redacts; a plain PASSPORT heading kept", () => {
    expect(redacted("MRZ P<UTOERIKSSON<<ANNA<MARIA<<<<<<", "P<UTOERIKSSON<<ANNA<MARIA<<<<<<")).toBe(true);
    expect(kept("PASSPORT DETAILS below", "PASSPORT DETAILS")).toBe(true);
  });
  it("Brazil CPF: valid check digits redact; wrong kept", () => {
    expect(redacted("CPF 111.444.777-35", "111.444.777-35")).toBe(true);
    expect(kept("ref 111.444.777-00 x", "111.444.777-00")).toBe(true);
  });
  it("Brazil CNPJ: valid redacts; wrong kept", () => {
    expect(redacted("CNPJ 11.222.333/0001-81", "11.222.333/0001-81")).toBe(true);
    expect(kept("num 11.222.333/0001-00 x", "11.222.333/0001-00")).toBe(true);
  });
  it("Chile RUT: valid mod-11 redacts; wrong DV kept", () => {
    expect(redacted("RUT 12.345.678-5", "12.345.678-5")).toBe(true);
    expect(kept("id 12.345.678-0 x", "12.345.678-0")).toBe(true);
  });
  it("Mexico CURP (distinctive) redacts; RFC only WITH context", () => {
    expect(redacted("CURP GOMC900101HDFBRN09", "GOMC900101HDFBRN09")).toBe(true);
    expect(redacted("RFC GODE561231GR8", "GODE561231GR8")).toBe(true);
    expect(kept("rfc spec 2616 section", "2616")).toBe(true);
  });
  it("Argentina DNI only WITH context", () => {
    expect(redacted("DNI 12.345.678", "12.345.678")).toBe(true);
    expect(kept("stock 12.345.678 units", "12.345.678")).toBe(true);
  });
});

describe("new detectors — bank details (gated)", () => {
  it("RIB: context + mod-97 redacts; UK sort code / EU VAT gated", () => {
    expect(redacted("RIB 30002 00550 0000157841Z 25", "30002 00550 0000157841Z 25")).toBe(true);
    expect(redacted("sort code 12-34-56", "12-34-56")).toBe(true);
    expect(redacted("VAT GB123456789", "GB123456789")).toBe(true);
    expect(kept("the score was 12-34-56 overall", "12-34-56")).toBe(true);
  });
});

describe("new detectors — extra crypto chains", () => {
  const B58 = "A1zP2ce3Qm4rf5tY6uH7Jk8Lm9Np2Qr3St4Uv5Wx6Yz7bc8de9fg"; // base58-safe filler
  it("redacts Monero / Litecoin / Dogecoin / Tron / XRP / Cosmos / BCH", () => {
    expect(redacted("wallet 4" + B58.repeat(2).slice(0, 94), "4" + B58.repeat(2).slice(0, 94))).toBe(true); // Monero
    expect(redacted("pay ltc1" + "q".repeat(30), "ltc1" + "q".repeat(30))).toBe(true); // Litecoin bech32
    expect(redacted("wallet L" + B58.slice(0, 30), "L" + B58.slice(0, 30))).toBe(true); // Litecoin legacy
    expect(redacted("dogecoin D" + B58.slice(0, 33), "D" + B58.slice(0, 33))).toBe(true); // Dogecoin
    expect(redacted("trx T" + B58.slice(0, 33), "T" + B58.slice(0, 33))).toBe(true); // Tron
    expect(redacted("xrp r" + B58.slice(0, 30), "r" + B58.slice(0, 30))).toBe(true); // Ripple
    expect(redacted("atom cosmos1" + "a".repeat(38), "cosmos1" + "a".repeat(38))).toBe(true); // Cosmos
    expect(redacted("bch bitcoincash:q" + "a".repeat(41), "bitcoincash:q" + "a".repeat(41))).toBe(true); // BCH
  });
  it("keeps ordinary short strings that just start with a letter", () => {
    expect(kept("grade D and rank L today", "D")).toBe(true);
    expect(kept("route T then turn", "T")).toBe(true);
  });
  it("does NOT redact a bare base58 run as CRYPTO without a context word", () => {
    // A random base58 id starting with r/T/D on a browsed page must NOT false-
    // positive as XRP/Tron/Dogecoin — the single-leading-letter rules are gated.
    // (Disable the generic `apikey` heuristic, off by default in the app, so this
    // isolates the crypto rules.)
    const noApiKey = (t: string) => redact(t, { disabledKinds: ["apikey"] }).text;
    for (const s of ["ref r" + B58.slice(0, 30) + " ok", "code T" + B58.slice(0, 33) + " x"]) {
      expect(noApiKey(s)).not.toMatch(/\[REDACTED_CRYPTO_\d+\]/);
    }
  });
});

describe("new detectors — extra vendor tokens & SSH", () => {
  it("redacts distinctive vendor-prefixed secrets", () => {
    expect(redacted("k=glpat-abcXYZ012_khjhgftre45", "glpat-abcXYZ012_khjhgftre45")).toBe(true);
    expect(redacted("shopify shpat_0123456789abcdef0123456789abcdef", "shpat_0123456789abcdef0123456789abcdef")).toBe(true);
    expect(redacted("hf hf_" + "a".repeat(34), "hf_" + "a".repeat(34))).toBe(true);
    expect(redacted("do doo_v1_" + "a".repeat(64), "doo_v1_" + "a".repeat(64))).toBe(true);
    expect(redacted("pm PMAK-" + "a".repeat(24) + "-" + "b".repeat(34), "PMAK-" + "a".repeat(24) + "-" + "b".repeat(34))).toBe(true);
    expect(redacted("db dapi" + "0".repeat(32), "dapi" + "0".repeat(32))).toBe(true);
    expect(redacted("lin lin_api_" + "A".repeat(40), "lin_api_" + "A".repeat(40))).toBe(true);
    expect(redacted("ntn ntn_" + "b".repeat(36), "ntn_" + "b".repeat(36))).toBe(true);
    expect(redacted("tg 123456789:AA" + "F".repeat(33), "123456789:AA" + "F".repeat(33))).toBe(true);
    expect(redacted("dp dp.pt." + "z".repeat(40), "dp.pt." + "z".repeat(40))).toBe(true);
    expect(redacted("key ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExampleKeyData12345", "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExampleKeyData12345")).toBe(true);
  });
  it("keeps a truncated / look-alike token", () => {
    expect(kept("branch glpat-short here", "glpat-short")).toBe(true);
    expect(kept("run PMAK-nope now", "PMAK-nope")).toBe(true);
  });
});

describe("existing rules — IPv6 compression + SSN validation", () => {
  it("redacts compressed IPv6 that the old rule missed", () => {
    expect(redacted("host fe80::1 up", "fe80::1")).toBe(true);
    expect(redacted("gw 2001:db8::1 ok", "2001:db8::1")).toBe(true);
    expect(redacted("addr 2001:db8::8a2e:370:7334 x", "2001:db8::8a2e:370:7334")).toBe(true);
  });
  it("does NOT redact C++ scope / clock times as IPv6", () => {
    expect(kept("std::vector<int> v", "std::vector")).toBe(true);
    expect(kept("Foo::bar() called", "Foo::bar")).toBe(true);
    expect(kept("at 21:21:09 today", "21:21:09")).toBe(true);
  });
  it("SSN: context-gated — valid dashed redacts WITH context, bare 3-2-4 refs kept", () => {
    expect(redacted("SSN 078-05-1120", "078-05-1120")).toBe(true);
    expect(redacted("Social Security Number: 123-45-6789", "123-45-6789")).toBe(true);
    // valid-range 3-2-4 numbers WITHOUT an SSN keyword are ordinary refs → kept now
    expect(kept("ticket 123-45-6789 open", "123-45-6789")).toBe(true);
    expect(kept("order 100-20-3000 shipped", "100-20-3000")).toBe(true);
    // impossible ranges stay kept even with context (ssnValid still runs)
    expect(kept("SSN 000-12-3456", "000-12-3456")).toBe(true); // area 000 invalid
    expect(kept("SSN 666-45-6789", "666-45-6789")).toBe(true); // area 666 invalid
  });
});

describe("secrets de configuration — la valeur entière, la bonne clé", () => {
  it("un mot de passe GUILLEMETÉ n'est pas coupé à son « # »", () => {
    // Hors guillemets, « # » ouvre un commentaire (`KEY=val # note`) et la règle doit
    // s'y arrêter ; DANS des guillemets c'est un caractère de mot de passe ordinaire.
    // Coffré à « Sm7p!Tanc2026 », la queue « #x » partait en clair : un secret tronqué
    // est un secret fuité.
    expect(redacted('pass: "Sm7p!Tanc2026#x"', "Sm7p!Tanc2026#x")).toBe(true);
    expect(redacted('password: "Sm7p!Tanc2026#x"', "Sm7p!Tanc2026#x")).toBe(true);
    // Hors guillemets, le commentaire reste hors de la valeur.
    expect(kept("API_KEY=abcdef123456 # clé de test", "# clé de test")).toBe(true);
  });

  it("les clés « pass » / « mdp » sont bornées à une POSITION de clé", () => {
    expect(redacted("mdp : Sm7p2026x", "Sm7p2026x")).toBe(true);
    // Un mot ordinaire finissant par « pass » ne peut pas ouvrir un secret.
    expect(kept("il faut surpass: quelque chose ici", "quelque")).toBe(true);
  });
});

describe("identifiants gatés ajoutés par le corpus de mises en page", () => {
  it("RPPS / ADELI — l'identifiant du PRATICIEN, en tête de toute ordonnance", () => {
    expect(redacted("Médecin généraliste — RPPS 10003456789", "10003456789")).toBe(true);
    expect(redacted("N° ADELI 691234567", "691234567")).toBe(true);
    // Nu, c'est un compte quelconque : la barre de précision interdit qu'il parte seul.
    expect(kept("le rapport comptait 10003456789 actes", "10003456789")).toBe(true);
  });

  it("RUM (mandat SEPA) et PNR (dossier de réservation)", () => {
    expect(redacted("Référence unique du mandat (RUM) : RUM-2026-000841-CB", "2026-000841-CB")).toBe(true);
    expect(redacted("Réf. PNR 4KQ7ZB", "4KQ7ZB")).toBe(true);
    // Un PNR mêle lettres ET chiffres — un mot de six lettres après « réservation »
    // est de la prose.
    expect(kept("votre réservation ANNULE sans frais", "ANNULE")).toBe(true);
  });

  it("référence de dossier tri-segmentée — jamais une plage de dates", () => {
    expect(redacted("Dossier : 2026/BM/44127", "2026/BM/44127")).toBe(true);
    expect(kept("référence du 12/05/2024 au 30/06/2024", "12/05/2024")).toBe(true);
  });
});

describe("e-mail à ESPACE d'OCR — « amelie.brivet @example.com »", () => {
  it("redacted l'adresse malgré l'espace, valeur VERBATIM (espace compris)", () => {
    const out = redact("Contact : amelie.brivet @example.com pour le dossier.", {});
    expect(out.text).not.toContain("amelie.brivet");
    expect(out.matches.some((m) => m.value === "amelie.brivet @example.com")).toBe(true);
    const both = redact("écrire à jean.cros @ mail.example.fr vite", {});
    expect(both.text).not.toContain("jean.cros");
  });

  it("la prose avec « @ » n'est jamais une adresse", () => {
    expect(redact("les prix @ 10 % restent stables", {}).matches).toEqual([]);
    expect(redact("rendez-vous @ midi place Balard", {}).matches).toEqual([]);
    // deux espaces = gouttière de colonne, pas une adresse
    expect(redact("brivet  @example.com", {}).text).toContain("brivet  @");
  });
});

describe("badge — gated sur son mot-clé", () => {
  it("« badge B-58421 » est redacted ; le même id nu reste en clair", () => {
    expect(redact("workstation ok badge B-58421", {}).text).not.toContain("B-58421");
    expect(redact("le lot B-58421 est parti", {}).text).toContain("B-58421");
  });
});

describe("confusables OCR — le checksum sur la lecture RÉPARÉE reste le juge", () => {
  it("un IBAN scanné « FR76 3OO0 … » (O pour 0) est redacted, valeur verbatim", () => {
    const out = redact("Virement sur FR76 3OO0 6000 0112 3456 7890 189 demain.", {});
    expect(out.text).not.toContain("3OO0");
    expect(out.matches.some((m) => m.type === "iban" && m.value.includes("3OO0"))).toBe(true);
  });

  it("une carte scannée « 5453 O112 8367 9O15 » est redacted", () => {
    expect(redact("Réglé par carte 5453 O112 8367 9O15 hier.", {}).text).not.toContain("9O15");
  });

  it("un O qui remplace un AUTRE chiffre échoue au Luhn réparé — et reste en clair", () => {
    // 578O répare en 5780 alors que la carte valide portait 5787 : la réparation ne
    // crée jamais une validité qui n'existait pas.
    expect(redact("Réglé par carte 4539 578O 6362 1486 hier.", {}).text).toContain("578O");
  });

  it("un jeton chargé en O sans Luhn valide ne matche jamais", () => {
    expect(redact("lot OO12 3456 7812 3452 sans rapport", {}).matches).toEqual([]);
  });
});
