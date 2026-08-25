import { describe, expect, it } from "vitest";
import { redact } from "../../index";
import { mrzLineValid, brCpfValid } from "../validators/validators.world";
import { beVatValid } from "../validators/validators.europe";

// Same harness as rules.international.test.ts — the REAL engine in marker mode, so
// ordering/overlap with card/IBAN/phone is exercised. Every positive vector below is
// CHECKSUM-VALID for its scheme (official published examples where they exist,
// algorithm-computed otherwise).
function out(text: string): string {
  return redact(text, {}).text;
}
function redacted(text: string, value: string): boolean {
  const o = out(text);
  return !o.includes(value) && /\[REDACTED_[A-Z_]+_\d+\]/.test(o);
}

describe("Europe — new checksum-validated schemes", () => {
  const cases: Array<[string, string]> = [
    ["Belgium registre national (dotted)", "85.07.30-033.28"],
    ["Switzerland AVS (756 prefix)", "756.9217.0769.85"],
    ["Luxembourg matricule", "1985073012340"],
    ["Norway fødselsnummer", "01079512334"],
    ["Czechia rodné číslo (slashed)", "800123/0006"],
  ];
  for (const [name, value] of cases) {
    it(`redacts ${name} bare`, () => {
      expect(redacted(`Réf: ${value} fin.`, value)).toBe(true);
    });
  }

  const gated: Array<[string, string, string]> = [
    ["Netherlands BSN", "BSN : 111222333", "111222333"],
    ["Portugal NIF", "NIF: 123456789", "123456789"],
    ["Ireland PPS", "PPS: 1234567T", "1234567T"],
    ["Austria SVNR", "SVNR 1237 010180", "1237 010180"],
    ["Greece AMKA", "AMKA : 01018012342", "01018012342"],
    ["Denmark CPR", "CPR: 070761-4285", "070761-4285"],
    ["UK passport", "passport 123456789", "123456789"],
    ["UK UTR", "UTR: 1234567890", "1234567890"],
  ];
  for (const [name, text, value] of gated) {
    it(`redacts ${name} (gated)`, () => {
      expect(redacted(text, value)).toBe(true);
    });
  }
});

describe("Americas — new schemes", () => {
  it("redacts Brazil CPF / CNPJ (formatted, bare; glued, gated)", () => {
    expect(redacted("doc 111.444.777-35 ok", "111.444.777-35")).toBe(true);
    expect(redacted("empresa 11.222.333/0001-81 ok", "11.222.333/0001-81")).toBe(true);
    expect(redacted("CPF 11144477735 ok", "11144477735")).toBe(true);
  });

  it("rejects a CPF whose check digits are wrong", () => {
    expect(brCpfValid("111.444.777-36")).toBe(false);
    expect(out("doc 111.444.777-36 ok")).toContain("111.444.777-36");
  });

  it("redacts Chile RUT (dotted bare; plain gated)", () => {
    expect(redacted("cliente 12.345.678-5 ok", "12.345.678-5")).toBe(true);
    expect(redacted("RUT 12345678-5 ok", "12345678-5")).toBe(true);
  });

  it("redacts Argentina CUIT (dashed bare)", () => {
    expect(redacted("factura de 20-12345678-6 ok", "20-12345678-6")).toBe(true);
  });

  it("redacts Mexico CURP bare (check digit) and RFC gated", () => {
    expect(redacted("alta de GOMC900514HDFMRR05 ok", "GOMC900514HDFMRR05")).toBe(true);
    expect(redacted("RFC: GOMC900514AB1", "GOMC900514AB1")).toBe(true);
  });

  it("redacts US ITIN / MBI / driver's license and Canada passport (all gated)", () => {
    expect(redacted("ITIN 912-70-1234 filed", "912-70-1234")).toBe(true);
    expect(redacted("Medicare MBI: 1EG4-TE5-MK73", "1EG4-TE5-MK73")).toBe(true);
    expect(redacted("driver's license D12345678 issued", "D12345678")).toBe(true);
    expect(redacted("passeport AB123456 émis", "AB123456")).toBe(true);
  });
});

describe("Asia-Pacific — new schemes + strengthened Australian checksums", () => {
  it("redacts a China resident ID bare (mod 11-2, X check char)", () => {
    expect(redacted("身份证 11010519491231002X 登记", "11010519491231002X")).toBe(true);
  });

  it("redacts a Hong Kong HKID bare (paren check digit)", () => {
    expect(redacted("HKID A123456(3) noted", "A123456(3)")).toBe(true);
    expect(out("ref B123456(9) sent")).not.toContain("NATIONAL_ID");
  });

  it("redacts Japan My Number (gated + checksum)", () => {
    expect(redacted("My Number 1234 5678 9018", "1234 5678 9018")).toBe(true);
  });

  it("redacts Malaysia MyKad bare (date-led double-dash) and Indonesia NIK gated", () => {
    expect(redacted("MyKad 850730-14-5678 ok", "850730-14-5678")).toBe(true);
    expect(redacted("NIK 3171070807850001 terdaftar", "3171070807850001")).toBe(true);
  });

  it("redacts Israel Teudat Zehut and NZ IRD (gated + checksum)", () => {
    expect(redacted("Teudat Zehut: 123456782", "123456782")).toBe(true);
    expect(redacted("IRD 49-091-850 filed", "49-091-850")).toBe(true);
  });

  it("Australia: the official checksums now gate TFN/ABN/ACN/Medicare", () => {
    expect(redacted("TFN 123 456 782 lodged", "123 456 782")).toBe(true);
    expect(redacted("ABN 51 824 753 556 active", "51 824 753 556")).toBe(true);
    expect(redacted("ACN 000 000 019 registered", "000 000 019")).toBe(true);
    expect(redacted("Medicare 2123 45670 1 card", "2123 45670 1")).toBe(true);
    // Wrong TFN check → the keyword alone no longer grabs it.
    expect(out("TFN 123 456 789 lodged")).toContain("123 456 789");
  });
});

describe("Global — MRZ lines and VIN", () => {
  const NAME_LINE = "P<FRAMARTIN<<JULIEN<LOUIS<<<<<<<<<<<<<<<<<<<";
  const DATA_LINE = "12AB345673FRA8507309M3307308<<<<<<<<<<<<<<04";

  it("redacts a passport MRZ NAME line and DATA line (what OCR of a CNI/passport yields)", () => {
    expect(redacted(`scan:\n${NAME_LINE}\nfin`, NAME_LINE)).toBe(true);
    expect(redacted(`scan:\n${DATA_LINE}\nfin`, DATA_LINE)).toBe(true);
  });

  it("mrzLineValid — accepts name/data lines, rejects a plain caps run", () => {
    expect(mrzLineValid(NAME_LINE)).toBe(true);
    expect(mrzLineValid(DATA_LINE)).toBe(true);
    expect(mrzLineValid("ABCDEFGHIJKLMNOPQRSTUVWXYZABCD")).toBe(false);
  });

  it("VIN stays covered by the PRE-EXISTING identifiers rule (no duplicate added)", () => {
    // rules.identifiers.ts already fires bare on the ISO-3779 check digit.
    expect(redacted("VIN 1HGCM82633A004352 du véhicule", "1HGCM82633A004352")).toBe(true);
  });
});

describe("secrets — French key names + one-time codes", () => {
  it("redacts « mot de passe : … » and friends (the FR/EN asymmetry)", () => {
    expect(redacted("mot de passe : hunter2secret", "hunter2secret")).toBe(true);
    expect(redacted("code secret : abc12345", "abc12345")).toBe(true);
    expect(redacted("phrase secrète : correct horse battery", "correct")).toBe(true);
  });

  it("redacts OTP / verification / PIN codes, never a postal code", () => {
    expect(redacted("code de vérification : 483920", "483920")).toBe(true);
    expect(redacted("Votre code PIN : 4832", "4832")).toBe(true);
    expect(redacted("one-time password 39201847 expires", "39201847")).toBe(true);
    // "code postal" is a different label family — must not read as a secret.
    expect(out("code postal : 75015")).not.toContain("SECRET");
  });
});

describe("license plates, EU VAT pack, bank micro-formats, LEI", () => {
  it("redacts FR/DE plates with vehicle context, leaves a bare dashed code alone", () => {
    expect(redacted("véhicule immatriculé AA-123-BB volé", "AA-123-BB")).toBe(true);
    expect(redacted("plaque 123 ABC 75 relevée", "123 ABC 75")).toBe(true);
    expect(redacted("Fahrzeug Kennzeichen B-AB 1234 gemeldet", "B-AB 1234")).toBe(true);
    expect(out("réf AA-123-BB du dossier")).toContain("AA-123-BB");
  });

  it("redacts the EU VAT pack (checksummed bare where the country publishes one)", () => {
    for (const v of ["BE0417497106", "PL1234563218", "SE556036079301", "DK13585628", "PT123456789", "NL123456789B01", "ATU12345678", "ESB1234567H"]) {
      expect(redacted(`TVA ${v} facturée`, v)).toBe(true);
    }
    // Wrong Belgian check → the VAT validator refuses. (Asserted on the validator,
    // not the engine: a wrong-check string can still FLUKE into an IBAN-shaped
    // mod-97 match with the following word — observed with "BE0417497107 fa".)
    expect(beVatValid("BE0417497107")).toBe(false);
  });

  it("redacts CLABE / IFSC / sort code / BSB (gated)", () => {
    expect(redacted("CLABE 032180000118359719 registrada", "032180000118359719")).toBe(true);
    expect(redacted("IFSC HDFC0001234 branch", "HDFC0001234")).toBe(true);
    expect(redacted("sort code 12-34-56 provided", "12-34-56")).toBe(true);
    expect(redacted("BSB 062-000 credited", "062-000")).toBe(true);
  });

  it("redacts a valid LEI bare (ISO 7064 mod 97-10)", () => {
    expect(redacted("entité 969500KSV493XWY0PS33 enregistrée", "969500KSV493XWY0PS33")).toBe(true);
    expect(out("entité 969500KSV493XWY0PS34 enregistrée")).not.toContain("NATIONAL_ID");
  });
});

describe("company_id / bank_route — the toggle split", () => {
  it("company identifiers now carry their OWN marker (COMPANY_ID, not NATIONAL_ID)", () => {
    for (const [text, value] of [
      ["SIRET 775 384 225 00013 immatriculée", "775 384 225 00013"],
      ["TVA FR 79 345 360 051 facturée", "FR 79 345 360 051"],
      ["entité 969500KSV493XWY0PS33 enregistrée", "969500KSV493XWY0PS33"],
      ["empresa 11.222.333/0001-81 ok", "11.222.333/0001-81"],
    ] as const) {
      const o = out(text);
      expect(o).not.toContain(value);
      expect(o).toContain("COMPANY_ID");
    }
  });

  it("bank coordinates carry BANK_ROUTE (they ride the iban toggle)", () => {
    for (const text of ["sort code 12-34-56 provided", "BSB 062-000 credited", "CLABE 032180000118359719 registrada"]) {
      expect(out(text)).toContain("BANK_ROUTE");
    }
  });

  it("toggle independence: company_id off leaves SIREN clear, the passport stays masked", async () => {
    const { pseudonymize } = await import("../../index");
    const r = await pseudonymize(
      "SIREN 775384225 — passeport n° 12AB34567",
      { vault: {}, disabledKinds: ["company_id"] },
    );
    expect(r.text).toContain("775384225");
    expect(r.text).not.toContain("12AB34567");
  });
});

describe("caution-act footer schemes (RCS Luxembourg / ORIAS / IDU)", () => {
  it("redacts an RCS Luxembourg number next to its register keyword", () => {
    expect(redacted("RCS Luxembourg B 61 227 - Siège social", "B 61 227")).toBe(true);
    expect(redacted("RCS Lux. B 58149", "B 58149")).toBe(true);
  });

  it("never fires on a bare B-number (a postal box / bus line, no register keyword)", () => {
    expect(out("boîte postale B 61 227 ouverte")).toContain("B 61 227");
  });

  it("redacts an ORIAS number after the keyword AND after the register prose", () => {
    expect(redacted("N° ORIAS : 07 042 385", "07 042 385")).toBe(true);
    expect(
      redacted(
        "immatriculée au Registre des Intermédiaires en Assurance sous le numéro 07 042 385,",
        "07 042 385",
      ),
    ).toBe(true);
  });

  it("never fires on the same 8 digits without the ORIAS context", () => {
    expect(out("total facturé 07 042 385 unités")).toContain("07 042 385");
  });

  it("redacts the distinctive IDU shape bare (FR + 6 digits + _ + 2 digits + 4 alnum)", () => {
    expect(redacted("Identifiant unique : FR194628_01ZVJG attribué", "FR194628_01ZVJG")).toBe(true);
    expect(redacted("N°IDU : FR194628_03UKDQ", "FR194628_03UKDQ")).toBe(true);
  });

  it("ignores a near-miss IDU (wrong digit run)", () => {
    expect(out("code FR1946_01ZVJG interne")).toContain("FR1946_01ZVJG");
  });
});
