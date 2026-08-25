import { describe, it, expect } from "vitest";
import { fakeGeo, resolveCountry, PLACES_BY_COUNTRY } from "./index";
import { regionOfCp, departmentOfCp, fakeDepartment, fakeRegion } from "../frGeo";
import { usStateName } from "./usStates";
import { pseudonymize, unredact } from "../../index";

const cities = (c: string) => new Set(PLACES_BY_COUNTRY[c].map((p) => p.city));

describe("multi-country coherent place fakes", () => {
  it("FR: a CP+city is faked as ONE coherent place in a DIFFERENT region", () => {
    const out = fakeGeo("PLACE", "35136 Saint-Jacques-de-la-Lande", 7, "FR")!;
    const m = out.match(/^(\d{5})\s+(.+)$/u)!;
    expect(m).toBeTruthy();
    expect(m[1]).not.toBe("35136"); // not the user's own code
    expect(regionOfCp(m[1])).not.toBe("Bretagne"); // 35 → Bretagne — must NOT disclose it
    expect(cities("FR").has(m[2])).toBe(true); // still a real, coherent FR place (city↔code)
  });

  it("a German address WITH a city is faked as a German place in German format", () => {
    const out = fakeGeo("ADDRESS", "Marienplatz 8, 80331 München", 3, "DE")!;
    const city = out.split(/[\s,]+/).at(-1)!;
    expect(cities("DE").has(city)).toBe(true);
    expect(out).not.toMatch(/\brue\b|Lilas/); // never a French place
  });

  it("a STREET-ONLY address stays street-only — no invented city/postal", () => {
    // The reported bug: a bare street ("75 rue de paris") was faked to a FULL address
    // with an invented "CP Ville" that then conflicts with a separate Commune field.
    expect(fakeGeo("ADDRESS", "75 rue de paris", 3, "FR")!).not.toMatch(/\d{4,5}/); // no postal
    expect(fakeGeo("ADDRESS", "Marienplatz 8", 3, "DE")!).not.toMatch(/,/); // no ", city" tail
  });

  it("resolveCountry: explicit-uncovered → null; else guessed from postal/street", () => {
    expect(resolveCountry("東京都渋谷区", "JP")).toBeNull(); // covered? no → same-shape fallback
    expect(resolveCountry("Marienplatz 8 München")).toBe("DE");
    expect(resolveCountry("Calle Mayor 12 Madrid")).toBe("ES");
    expect(resolveCountry("Via Roma 12 Milano")).toBe("IT");
    expect(resolveCountry("4 rue des Lilas 75001 Paris")).toBe("FR");
    expect(resolveCountry("SW1A 1AA")).toBe("GB"); // UK postal shape
  });

  it("uncovered country → keeps the shape, never a wrong-country place", () => {
    // A bare Japanese postal has no FR/EU/NA table → same-shape scramble (null here).
    expect(fakeGeo("POSTAL_CODE", "123-4567", 1, "JP")).toBeNull();
  });

  it("end-to-end: FR — coherent + reversible, and an ALL-CAPS city isn't a name", async () => {
    const vault: Record<string, string> = {};
    const { text } = await pseudonymize("8 RUE RAFFIN 92240 MALAKOFF", { vault });
    expect(text).not.toContain("MALAKOFF");
    expect(text).toMatch(/\d{5}\s+\p{Lu}/u); // a "NNNNN City" pair, not "NNNNN Firstname"
    expect(unredact(text, vault)).toBe("8 RUE RAFFIN 92240 MALAKOFF");
  });

  it("end-to-end: a full US address is faked as a US place — city/state/ZIP don't leak", async () => {
    const vault: Record<string, string> = {};
    const { text } = await pseudonymize("350 Fifth Avenue New York NY 10001", { vault });
    expect(text).not.toContain("New York");
    expect(text).not.toContain("10001");
    expect([...cities("US")].some((c) => text.includes(c))).toBe(true);
    expect(unredact(text, vault)).toBe("350 Fifth Avenue New York NY 10001");
  });

  it("end-to-end: a full Spanish address is faked as a Spanish place (code+city coherent)", async () => {
    const vault: Record<string, string> = {};
    const { text } = await pseudonymize("Calle Mayor 10 28013 Madrid", { vault });
    expect(text).not.toContain("Madrid");
    expect([...cities("ES")].some((c) => text.includes(c))).toBe(true);
    expect(unredact(text, vault)).toBe("Calle Mayor 10 28013 Madrid");
  });

  it("end-to-end: a labeled German address stays German and reverses", async () => {
    const vault: Record<string, string> = {};
    const { text } = await pseudonymize("Anschrift: Marienplatz 8 München", { vault });
    expect([...cities("DE")].some((c) => text.includes(c))).toBe(true);
    expect(text).not.toMatch(/\brue\b/);
    expect(unredact(text, vault)).toBe("Anschrift: Marienplatz 8 München");
  });

  it("end-to-end: a street-only 'Adresse' field is NOT faked into a full address (no duplicate place)", async () => {
    // Reported bug: on a cadastral form, the street-only "Adresse" line was faked to a FULL
    // address with an invented "CP Ville" that then conflicted with the separate "Commune"
    // line (faked apart) → "several fake addresses for ONE real address". The address line
    // must stay street-only so the only place is the Commune's.
    const input = "Adresse : 75 rue de paris\nCommune : 92110 CLICHY\nDépartement : Hauts-de-Seine";
    const vault: Record<string, string> = {};
    const { text } = await pseudonymize(input, { vault });
    const [addrLine, communeLine] = text.split("\n");
    expect(addrLine).not.toMatch(/\d{4,5}/); // no invented postal on the address line
    expect(addrLine).not.toContain("75 rue de paris"); // the street IS still redacted
    // P3: the Commune "92110 CLICHY" is faked as a coherent "CP Ville" — the postal is
    // KEPT, not dropped to a bare city ("cergy").
    expect(communeLine).toMatch(/\d{5}\s+\p{Lu}/u);
    expect(communeLine).not.toContain("92110"); // the real postal is redacted
    // P2: the fake Commune and the fake Département name the SAME real place — the fake
    // commune's postal belongs to the fake department (coherent block, not "89000 AUXERRE"
    // + "Essonne").
    const deptLine = text.split("\n")[2];
    const communeCp = communeLine.match(/\d{5}/)![0];
    const deptFake = deptLine.replace(/^[^:]*:[\s.]*/, "").trim();
    expect(departmentOfCp(communeCp)).toBe(deptFake);
    expect(unredact(text, vault)).toBe(input); // fully reversible
  });

  it("end-to-end: a US City / State / Zip block fakes to ONE coherent US place", async () => {
    const input = "City : Austin\nState : Texas\nZip code : 78701";
    const vault: Record<string, string> = {};
    const { text } = await pseudonymize(input, { vault });
    const [cityLine, stateLine, zipLine] = text.split("\n");
    const cityFake = cityLine.replace(/^[^:]*:\s*/, "").trim();
    const stateFake = stateLine.replace(/^[^:]*:\s*/, "").trim();
    const zipFake = zipLine.match(/\d{5}/)![0];
    const place = PLACES_BY_COUNTRY.US.find((p) => p.city === cityFake)!;
    expect(place).toBeTruthy(); // the fake city is a real US city
    expect(place.postal).toBe(zipFake); // its ZIP matches the Zip field
    expect(usStateName(place.region)).toBe(stateFake); // its state matches the State field (full name kept)
    expect(stateFake).not.toBe("Texas"); // a DIFFERENT state
    expect(unredact(text, vault)).toBe(input); // fully reversible
  });

  it("end-to-end: a CN 城市/省/邮编 block fakes to ONE coherent CN place", async () => {
    const input = "城市：深圳市\n省：广东省\n邮编：518000";
    const vault: Record<string, string> = {};
    const { text } = await pseudonymize(input, { vault });
    const [cityLine, provLine] = text.split("\n");
    const cityFake = cityLine.split("：")[1].trim();
    const provFake = provLine.split("：")[1].trim();
    const place = PLACES_BY_COUNTRY.CN.find((p) => p.city === cityFake)!;
    expect(place).toBeTruthy(); // a real CN city
    expect(place.region).toBe(provFake); // its province matches the 省 field (coherent)
    expect(cityFake).not.toBe("深圳市");
    expect(provFake).not.toBe("广东省");
    expect(unredact(text, vault)).toBe(input); // fully reversible
  });
});

describe("fakeGeo PLACE — the notarial 'Ville (CP)' layout is preserved", () => {
  it("keeps the parenthesised order and emits a COHERENT city + its own postal", () => {
    const out = fakeGeo("PLACE", "RENNES (35000)", 7, "FR")!;
    const m = out.match(/^([^(]+) \((\d{5})\)$/);
    expect(m).not.toBeNull();
    const [, city, cp] = m!;
    expect(city.trim().toUpperCase()).toBe(city.trim()); // ALL-CAPS casing preserved
    expect(city).not.toMatch(/rennes/i);
    expect(cp).not.toBe("35000");
    // The fake city and its postal come from ONE real place, in ANOTHER region.
    expect(regionOfCp(cp)).toBeDefined();
    expect(regionOfCp(cp)).not.toBe(regionOfCp("35000"));
  });

  it("a '(Département CP' open-paren (OCR) keeps its shape, department coherent", () => {
    const out = fakeGeo("PLACE", "SAINT-QUEN (SFINF-SAINT-DENIS 93400", 7, "FR")!;
    const m = out.match(/^(.+) \((.+) (\d{5})$/);
    expect(m).not.toBeNull();
    const [, , dept, cp] = m!;
    expect(cp).not.toBe("93400");
    expect(departmentOfCp(cp)?.toLowerCase()).toBe(dept.toLowerCase());
  });
});

describe("classe de l'initiale — l'élision du texte doit rester possible (15/08/2026)", () => {
  it("un département à initiale VOYELLE reçoit un faux à initiale voyelle", () => {
    // Mesuré : « Crédit Agricole Mutuel d'Ille-et-Vilaine » devenait « d'Morbihan » —
    // impossible à lire, et repérable comme un faux. L'article vit HORS du span (on ne
    // peut donc pas le réécrire sans casser la restitution) : c'est l'INITIALE du faux
    // qui doit s'adapter.
    for (const h of [0, 1, 7, 13, 42, 100]) {
      const f = fakeDepartment("Ille-et-Vilaine", h);
      expect(f).not.toBe("Ille-et-Vilaine");
      expect(/^[aeiouyàâäéèêëîïôöùûü]/i.test(f)).toBe(true);
    }
  });

  it("…et un département à initiale CONSONNE garde une consonne", () => {
    for (const h of [0, 3, 11, 57]) {
      const f = fakeDepartment("Morbihan", h);
      expect(f).not.toBe("Morbihan");
      expect(/^[aeiouyàâäéèêëîïôöùûü]/i.test(f)).toBe(false);
    }
  });

  it("même règle pour une région", () => {
    for (const h of [0, 5, 9]) {
      expect(/^[aeiouyàâäéèêëîïôöùûü]/i.test(fakeRegion("Île-de-France", h))).toBe(true);
      expect(/^[aeiouyàâäéèêëîïôöùûü]/i.test(fakeRegion("Bretagne", h))).toBe(false);
    }
  });

  // ⚠️ LIMITE ASSUMÉE : on rend l'élision POSSIBLE, pas l'article JUSTE. « d'Oise » se lit,
  // là où le français écrirait « de l'Oise » — l'accord de l'article demanderait le genre
  // et le nombre de chaque département, une donnée qu'on n'a pas. Le défaut corrigé est la
  // séquence IMPOSSIBLE (« d'Morbihan »), qui trahit le faux ; le résidu, lui, se lit.
});
