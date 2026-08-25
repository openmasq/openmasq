import { describe, expect, it } from "vitest";
import { fakeValidId, matchScheme } from "./index";
import { compactId } from "./helpers";
import { frVat, siret, sirenSiret, luhn, ibanValid } from "../../../engine/validators";
import { ribValid, imeiValid, iccidValid, vinValid } from "../../../engine/validators/validators.identifiers";
import {
  abaRoutingValid, caSinValid, deTaxIdValid, esNieValid, esNifValid, itVatValid,
  peselValid, thTninValid, trNationalIdValid, ukNhsValid, usNpiValid,
} from "../../../engine/validators/validators.international";
import {
  atSvnrValid, beNnValid, beVatValid, chAvsValid, czRcValid, dkCvrValid, grAmkaValid,
  iePpsValid, luMatriculeValid, nlBsnValid, noFnrValid, plNipValid, ptNifValid, seVatValid,
} from "../../../engine/validators/validators.europe";
import {
  arCuitValid, auAbnValid, auAcnValid, auMedicareValid, auTfnValid, brCnpjValid,
  brCpfValid, clRutValid, cnIdValid, hkHkidValid, ilIdValid, jpMyNumberValid, leiValid,
  mxClabeValid, mxCurpValid, nzIrdValid,
} from "../../../engine/validators/validators.world";
import { fakeCard, fakeIban } from "../entities";
import { fakeFor } from "../dispatch";

// Every vector below is CHECKSUM-VALID for its scheme (verified against the
// engine validators). The invariant under test: the FAKE passes the SAME
// validator the original does — generation can never drift from detection.
const CASES: Array<[string, string, string, (compact: string) => boolean]> = [
  ["fr_siret", "COMPANY_ID", "356 000 000 00048", siret],
  ["fr_siren", "COMPANY_ID", "863471587", sirenSiret],
  ["fr_vat", "COMPANY_ID", "FR 83 404 833 048", frVat],
  ["fr_rib", "BANK_ROUTE", "30002 00550 0000157841Z 25", ribValid],
  ["be_nn", "NATIONAL_ID", "85.07.30-033.28", beNnValid],
  ["ch_avs", "NATIONAL_ID", "756.9217.0769.85", chAvsValid],
  ["lu_matricule", "NATIONAL_ID", "1985073012340", luMatriculeValid],
  ["nl_bsn", "NATIONAL_ID", "111222333", nlBsnValid],
  ["pt_nif", "NATIONAL_ID", "123456789", ptNifValid],
  ["ie_pps", "NATIONAL_ID", "1234567T", iePpsValid],
  ["no_fnr", "NATIONAL_ID", "01079512334", noFnrValid],
  ["cz_rc", "NATIONAL_ID", "8001230006", czRcValid],
  ["at_svnr", "NATIONAL_ID", "1237 010180", atSvnrValid],
  ["gr_amka", "NATIONAL_ID", "01018012342", grAmkaValid],
  ["pl_pesel", "NATIONAL_ID", "44051401359", peselValid],
  ["es_nif", "NATIONAL_ID", "12345678Z", esNifValid],
  ["es_nie", "NATIONAL_ID", "X1234567L", esNieValid],
  ["de_taxid", "NATIONAL_ID", "65929970489", deTaxIdValid],
  ["uk_nhs", "NATIONAL_ID", "943 476 5919", ukNhsValid],
  ["tr_id", "NATIONAL_ID", "57441037966", trNationalIdValid],
  ["it_vat", "COMPANY_ID", "12345678903", itVatValid],
  ["be_vat", "COMPANY_ID", "BE0417497106", beVatValid],
  ["pl_nip", "COMPANY_ID", "PL1234563218", plNipValid],
  ["se_vat", "COMPANY_ID", "SE556036079301", seVatValid],
  ["dk_cvr", "COMPANY_ID", "DK13585628", (c) => dkCvrValid(c.slice(2))],
  ["us_npi", "NATIONAL_ID", "1234567893", usNpiValid],
  ["ca_sin", "NATIONAL_ID", "736 574 112", caSinValid],
  ["us_aba", "BANK_ROUTE", "021000021", abaRoutingValid],
  ["mx_clabe", "BANK_ROUTE", "032180000118359719", mxClabeValid],
  ["br_cpf", "NATIONAL_ID", "529.982.247-25", brCpfValid],
  ["br_cnpj", "COMPANY_ID", "11.444.777/0001-61", brCnpjValid],
  ["cl_rut", "NATIONAL_ID", "12.345.678-5", clRutValid],
  ["ar_cuit", "NATIONAL_ID", "20-32964233-0", arCuitValid],
  ["mx_curp", "NATIONAL_ID", "GOMC900514HDFMRR05", mxCurpValid],
  ["cn_id", "NATIONAL_ID", "11010519491231002X", cnIdValid],
  ["hk_hkid", "NATIONAL_ID", "A1234563", hkHkidValid],
  ["jp_mynumber", "NATIONAL_ID", "1234 5678 9018", jpMyNumberValid],
  ["il_id", "NATIONAL_ID", "030510002", ilIdValid],
  ["nz_ird", "NATIONAL_ID", "10 495 008", nzIrdValid],
  ["au_tfn", "NATIONAL_ID", "45 911 008", auTfnValid],
  ["au_abn", "COMPANY_ID", "51 824 753 556", auAbnValid],
  ["au_acn", "COMPANY_ID", "000 000 019", auAcnValid],
  ["au_medicare", "NATIONAL_ID", "2123 45670 1", auMedicareValid],
  ["th_tnin", "NATIONAL_ID", "3100502234516", thTninValid],
  ["imei", "NATIONAL_ID", "49-015420-323751-8", imeiValid],
  ["iccid", "NATIONAL_ID", "8933011234567890005", iccidValid],
  ["vin", "NATIONAL_ID", "1HGCM82633A004352", vinValid],
  ["lei", "COMPANY_ID", "969500KSV493XWY0PS33", leiValid],
];

describe("fakeValidId — a fake passes the SAME checksum as the original", () => {
  for (const [scheme, cat, value, valid] of CASES) {
    it(`${scheme}: valid, different, layout-preserving, deterministic`, () => {
      expect(valid(compactId(value)), `vector for ${scheme} must be valid`).toBe(true);
      const fake = fakeValidId(cat, value, 0);
      expect(fake, `no fake minted for ${scheme}`).not.toBeNull();
      expect(fake).not.toBe(value);
      expect(valid(compactId(fake!)), `fake ${fake} fails its own checksum`).toBe(true);
      // The separator SKELETON is preserved (fake digits re-laid under it).
      expect(fake!.replace(/[A-Za-z0-9]/g, "#")).toBe(value.replace(/[A-Za-z0-9]/g, "#"));
      // Deterministic per (value, salt); the conversation salt shifts it.
      expect(fakeValidId(cat, value, 0)).toBe(fake);
      const salted = [1, 2, 3, 4, 5].map((s) => fakeValidId(cat, value, s));
      expect(salted.some((f) => f !== fake)).toBe(true);
    });
  }

  it("NIR: sex digit kept, month valid, key recomputed (13- and 15-digit forms)", () => {
    for (const value of ["1 84 03 75 120 005 49", "2760419385207", "1940517238004"]) {
      const fake = fakeValidId("NATIONAL_ID", value, 0)!;
      const c = compactId(fake);
      expect(c[0]).toBe(compactId(value)[0]); // sex — the derived attribute
      expect(c).toMatch(/^[12]\d{2}(?:0[1-9]|1[0-2])/); // month stays plausible
      expect(c).not.toBe(compactId(value));
      if (c.length === 15) {
        // The last two digits are the OFFICIAL mod-97 key of the fake stem.
        let rem = 0;
        for (const ch of c.slice(0, 13)) rem = (rem * 10 + Number(ch)) % 97;
        expect(Number(c.slice(13))).toBe(97 - rem);
      }
    }
  });

  it("NIR: a Corsican département stays Corsican (2A/2B is part of the shape)", () => {
    const fake = fakeValidId("NATIONAL_ID", "1 85 07 2A 120 005 33", 0)!;
    expect(compactId(fake).slice(5, 7)).toMatch(/^2[AB]$/);
  });

  it("pins the AMBIGUITY ordering — a value validating several schemes goes to the FIRST, structural shapes last", () => {
    // A 9-digit run can genuinely pass several national checksums at once; the
    // fake then satisfies the CLAIMING scheme (deterministic, pinned here so a
    // reorder is a visible decision). The category cannot say which country the
    // detection gate saw — threading the RULE's scheme into Detection is the
    // tracked follow-up.
    expect(matchScheme("NATIONAL_ID", "123456782")).toBe("nl_bsn"); // also TFN/Teudat-valid
    expect(matchScheme("NATIONAL_ID", "219-09-9999")).toBe("us_ssn"); // structural, claimed LAST
    expect(matchScheme("NATIONAL_ID", "070761-4285")).toBe("dk_cpr"); // structural date, after all checksums
    // The Chilean RUT (one weak mod-11 over a banal run) requires its national
    // dash/dot LAYOUT — a spaced Canadian SIN is no longer claimed by it.
    expect(matchScheme("NATIONAL_ID", "12.345.678-5")).toBe("cl_rut");
    expect(matchScheme("NATIONAL_ID", "046 454 286")).not.toBe("cl_rut");
  });

  it("returns null for an unrecognised run (context-gated schemes keep the digit swap)", () => {
    // An AGDREF / CAF-style bare run has no checksum — no scheme claims it.
    expect(fakeValidId("NATIONAL_ID", "7512345678", 0)).toBeNull();
    // A non-id category never enters the scheme path, whatever the shape.
    expect(fakeValidId("HEALTH", "356 000 000 00048", 0)).toBeNull();
  });

  it("same digits under another grouping yield the SAME fake digits (fakeDigits doctrine)", () => {
    const a = compactId(fakeValidId("COMPANY_ID", "356 000 000 00048", 3)!);
    const b = compactId(fakeValidId("COMPANY_ID", "35600000000048", 3)!);
    expect(a).toBe(b);
  });
});

describe("dispatch — the id categories route through fakeValidId, with fallback", () => {
  it("a SIRET tagged COMPANY_ID gets a double-Luhn fake; an un-schemed run falls back", () => {
    const fake = fakeFor("COMPANY_ID", "356 000 000 00048", 0);
    expect(siret(fake.replace(/\D/g, ""))).toBe(true);
    // Fallback: same-shape digit swap (length + separators preserved).
    const fb = fakeFor("NATIONAL_ID", "7512345678", 0);
    expect(fb).toMatch(/^\d{10}$/);
    expect(fb).not.toBe("7512345678");
  });

  it("an LLM-style tag (SSN) reaches the scheme path through redactionCategory", () => {
    const fake = fakeFor("SSN", "219-09-9999", 0);
    expect(fake).toMatch(/^\d{3}-\d{2}-\d{4}$/);
    const [area, group, serial] = fake.split("-").map(Number);
    expect(area).toBeGreaterThan(0);
    expect(area).not.toBe(666);
    expect(area).toBeLessThan(900);
    expect(group).toBeGreaterThan(0);
    expect(serial).toBeGreaterThan(0);
  });
});

describe("fakeCard / fakeIban — brand and embedded RIB key survive", () => {
  it("fakeCard keeps the MII (network) digit and still passes Luhn", () => {
    for (const [pan, mii] of [
      ["4556 7375 8689 9855", "4"],
      ["371449635398431", "3"],
    ] as const) {
      const fake = fakeCard(pan, 0);
      expect(fake.replace(/\D/g, "")[0]).toBe(mii);
      expect(luhn(fake)).toBe(true);
      expect(fake).not.toBe(pan);
    }
  });

  it("a French IBAN fake embeds a VALID RIB key (not only the ISO mod-97)", () => {
    // Constructed from a mod-97-valid RIB; IBAN key computed per ISO 13616.
    const value = "FR33 3000 2005 5000 0015 7841 Z25";
    expect(ibanValid(value)).toBe(true);
    const fake = fakeIban(value, 0);
    expect(ibanValid(fake)).toBe(true);
    expect(ribValid(fake.replace(/\s/g, "").slice(4))).toBe(true);
    expect(fake).not.toBe(value);
  });
});
