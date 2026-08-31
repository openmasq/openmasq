import { describe, expect, it } from "vitest";
import { pseudonymize } from "./pseudonymize";
import { stripLeadingArticle, isGenericTerm } from "./detect";
import { unredact } from "../engine/vault";
import type { Vault } from "../types";

// Simulate the AI detector: a `complete` that returns the findings as the JSON
// array `detectWithModel` expects. This proves the AI path swaps each span for
// one of the SAME kind (name→name, city→city, postal code→postal code, …).
function modelReturning(findings: { value: string; category: string }[]) {
  return async () => JSON.stringify(findings);
}

/** The fake chosen for `original` (vault maps fake → original). */
function fakeOf(vault: Vault, original: string): string | undefined {
  return Object.entries(vault).find(([, v]) => v === original)?.[0];
}

describe("generic terms — case- AND separator-insensitive", () => {
  it("matches labels/doc words in any casing and with dotted-acronym separators", () => {
    for (const v of ["MONTANT", "Montant", "montant", "IBAN", "Iban", "RCS", "R.C.S", "R.C.S.", "S.I.R.E.N", "r-c-s", "Kbis", "Bulletin", "Cotisation", "Net à payer".split(" ")[0]]) {
      expect(isGenericTerm(v)).toBe(true);
    }
    // a real entity is NOT a generic term
    expect(isGenericTerm("Sabourdin")).toBe(false);
    expect(isGenericTerm("Sacem")).toBe(false);
    // separator strip must not eat accents (résumé stays a valid entry, not "rsum")
    expect(isGenericTerm("Résumé")).toBe(true);
    expect(isGenericTerm("résumé")).toBe(true);
  });

  it("covers legal-document words across languages (DE/ES/IT/PT/NL/PL + CJK)", () => {
    for (const v of [
      "Vertrag", "Rechnung", "Kündigung", // de
      "Contrato", "Factura", "Escritura", // es
      "Contratto", "Fattura", "Sentenza", // it
      "Fatura", "Procuração", "Certidão", // pt
      "Overeenkomst", "Factuur", "Dagvaarding", // nl
      "Umowa", "Faktura", "Wyrok", // pl
      "合同", "发票", "遗嘱", // zh
      "契約書", "請求書", "議事録", // ja
      "계약서", "청구서", "위임장", // ko
    ]) {
      expect(isGenericTerm(v)).toBe(true);
    }
    // name/brand collisions we deliberately EXCLUDED must NOT be dropped
    expect(isGenericTerm("Will")).toBe(false);
    expect(isGenericTerm("Paragon")).toBe(false);
  });

  it("covers French co-ownership / general-assembly vocabulary (the AG-notice bug)", () => {
    // These were mis-faked ORG/NAME ("assemblée générale" → "norwood labs", "syndic" →
    // "Jules") in a condo-meeting PDF. Article-stripping + case/separator-insensitivity
    // are applied by the CALLERS; here we assert the bare forms are generic.
    for (const v of [
      "assemblée générale", "Assemblée Générale", "ASSEMBLÉE GÉNÉRALE", "assemblée",
      "syndic", "Syndic", "syndicat", "copropriété", "copropriétaires",
      "conseil syndical", "ordre du jour", "mandataire", "gérant", "président",
    ]) {
      expect(isGenericTerm(v)).toBe(true);
    }
    // a genuine surname/company is still detected (not over-excluded)
    expect(isGenericTerm("Dunod")).toBe(false);
    expect(isGenericTerm("Corvanics")).toBe(false);
  });

  it("a mis-tagged 'MONTANT' header is NOT redacted, a real name still is", async () => {
    const vault: Vault = {};
    const { text } = await pseudonymize("MONTANT : 1250 — SABOURDIN Julien", {
      complete: modelReturning([
        { value: "MONTANT", category: "ORG" }, // NER over-flags the column header
        { value: "SABOURDIN Julien", category: "NAME" },
      ]),
      vault,
      numbers: false,
    });
    expect(text).toContain("MONTANT"); // header kept in clear
    expect(text).not.toContain("SABOURDIN Julien"); // real name redacted
  });
});

describe("leading article stripping (one identity across 'la Sacem' / 'Sacem')", () => {
  it("un ORG perd aussi la PRÉPOSITION avalée par le NER — le bug « oslen Partners »", () => {
    // Journal 01/08: « Quels sont les résultats de Karl Studio ? » → NER span
    // « de Karl Studio » → fake « oslen Partners » substituted WITH the « de » (grammar
    // broken on the wire) and a SECOND identity for the org (entityKey ≠ vault).
    expect(stripLeadingArticle("de Karl Studio", true)).toBe("Karl Studio");
    expect(stripLeadingArticle("d'Airbus", true)).toBe("Airbus");
    expect(stripLeadingArticle("de la Sacem", true)).toBe("Sacem"); // chained with the article
    // A PERSON keeps their particle (« de Gaulle ») — the strip is ORG-only.
    expect(stripLeadingArticle("de Gaulle")).toBe("de Gaulle");
    // A proper name with a CAPITALISED preposition stays whole, even under ORG.
    expect(stripLeadingArticle("De Beers", true)).toBe("De Beers");
  });

  it("keeps a lowercase article in clear but strips a capitalised proper-name article", () => {
    expect(stripLeadingArticle("la Sacem")).toBe("Sacem");
    expect(stripLeadingArticle("l'Afdas")).toBe("Afdas");
    expect(stripLeadingArticle("the Sacem")).toBe("Sacem");
    // Capitalised first-word article = part of the proper name → untouched.
    expect(stripLeadingArticle("La Rochelle")).toBe("La Rochelle");
    expect(stripLeadingArticle("Le Mans")).toBe("Le Mans");
    expect(stripLeadingArticle("Sacem")).toBe("Sacem");
  });

  it("'la Sodrac' and 'Sodrac' share ONE fake; the article 'la' stays in clear", async () => {
    // « Sacem » was this test's example org until it joined the NOTORIOUS seed (the
    // royalties-statement sender must ship in clear) — the mechanism under test is the
    // ARTICLE, so the data just needed a non-notorious society name.
    const input = "Il cotise à la Sodrac. La Sodrac gère les droits. Contactez Sodrac svp.";
    const vault: Vault = {};
    const { text } = await pseudonymize(input, {
      complete: modelReturning([
        { value: "la Sodrac", category: "ORG" }, // tagged WITH the article
        { value: "Sodrac", category: "ORG" },
      ]),
      vault,
      numbers: false,
    });
    expect(text).not.toContain("Sodrac"); // the real org never survives, any casing
    expect(text).toContain("à la "); // the determiner is untouched
    // ONE identity: every vaulted variant of "sodrac" reduces to a single fake base.
    const bases = new Set(
      Object.entries(vault)
        .filter(([, real]) => /sodrac/i.test(real))
        .map(([fake]) => fake.toLowerCase().replace(/[\s._-]+/g, "")),
    );
    expect(bases.size).toBe(1);
    expect(unredact(text, vault)).toBe(input); // fully reversible
  });
});

describe("AI redaction respects the same-kind rule", () => {
  it("name→name, city→city, postal→postal, phone→phone (same shape & length)", async () => {
    const input =
      "Jean Morvan habite à Paris 75008, tel +33 6 12 34 56 78";
    const vault: Vault = {};
    const { text } = await pseudonymize(input, {
      complete: modelReturning([
        { value: "Jean Morvan", category: "NAME" },
        { value: "Paris", category: "CITY" },
        { value: "75008", category: "POSTAL_CODE" },
        { value: "+33 6 12 34 56 78", category: "PHONE" },
      ]),
      vault,
      numbers: false,
    });

    // none of the originals survive
    for (const v of ["Jean Morvan", "Paris", "75008"]) {
      expect(text).not.toContain(v);
    }

    const name = fakeOf(vault, "Jean Morvan")!;
    expect(name).toMatch(/^\S+ \S+$/); // two words, like a name
    expect(name).not.toMatch(/\d/);
    // A name is built from believable first/last POOL words (via buildFakeName) so a
    // person keeps ONE stable fake identity across the conversation — reused per word
    // whether standalone, inside an email, or in any casing. Identity consistency wins
    // over the exact-length property (same trade-off as faked emails), so it is a
    // natural two-word name, not padded to the original's length.

    const city = fakeOf(vault, "Paris")!;
    expect(city).not.toMatch(/\d/); // a place, not a number
    expect(city).toHaveLength("Paris".length);

    const postal = fakeOf(vault, "75008")!;
    expect(postal).toMatch(/^\d{5}$/); // a 5-digit code, like a postal code
    expect(postal).not.toBe("75008");

    const phone = fakeOf(vault, "+33 6 12 34 56 78")!;
    expect(phone).toMatch(/^\+[\d ]+$/); // still a + phone number, same digit/space shape
    expect(phone).toHaveLength("+33 6 12 34 56 78".length);
    expect(phone).not.toBe("+33 6 12 34 56 78");
  });

  it("redacts an UPPERCASE name/city the model reported in normal case", async () => {
    // Text is UPPERCASE; the model normalises the case in its findings. A
    // case-sensitive match would drop both and leak the PII.
    const vault: Vault = {};
    const { text } = await pseudonymize("JEAN MORVAN habite à PARIS.", {
      complete: modelReturning([
        { value: "Jean Morvan", category: "NAME" },
        { value: "Paris", category: "CITY" },
      ]),
      vault,
      numbers: false,
    });
    expect(text).not.toContain("JEAN MORVAN");
    expect(text).not.toContain("PARIS");
    // the REAL (uppercase) text was what got vaulted, so it can be restored
    expect(fakeOf(vault, "JEAN MORVAN")).toBeDefined();
    expect(fakeOf(vault, "PARIS")).toBeDefined();
  });

  it("leaves a generic document/type title ('CV') in clear even if the model over-flags it as a NAME", async () => {
    // A Canva design literally titled "CV" was being detected as a NAME and faked
    // (→ "At"), leaking a wrong title and hiding the design. Generic type words
    // must survive so the app can still find/open them.
    const vault: Vault = {};
    const { text } = await pseudonymize("Résultats : CV, Facture, Jean Morvan", {
      complete: modelReturning([
        { value: "CV", category: "NAME" }, // model over-flags a generic title
        { value: "Facture", category: "ORG" }, // …and another
        { value: "Jean Morvan", category: "NAME" }, // a real name still goes
      ]),
      vault,
      numbers: false,
    });
    expect(text).toContain("CV"); // generic type word kept in clear
    expect(text).toContain("Facture"); // idem
    expect(text).not.toContain("Jean Morvan"); // a real entity is still swapped
  });

  it("leaves a meaningless number untouched in AI mode (numbers off by default)", async () => {
    const vault: Vault = {};
    const { text } = await pseudonymize("We shipped 839201 units to Jean Morvan", {
      complete: modelReturning([
        { value: "839201", category: "OTHER" }, // model over-flags a bare number
        { value: "Jean Morvan", category: "NAME" },
      ]),
      vault,
    });
    expect(text).toContain("839201"); // not modified — it corresponds to nothing
    expect(text).not.toContain("Jean Morvan"); // a real entity is still swapped
  });

  it("tokenises bare numbers to n1/n2 ONLY when explicitly enabled", async () => {
    const vault: Vault = {};
    const { text } = await pseudonymize("ship 839201 units", {
      complete: modelReturning([{ value: "839201", category: "OTHER" }]),
      vault,
      numbers: true,
    });
    expect(text).not.toContain("839201");
    expect(text).toMatch(/\bn\d+\b/);
  });

  it("still redacts a NUMERIC secret value (it corresponds to something)", async () => {
    const vault: Vault = {};
    const { text } = await pseudonymize("PASSWORD=482915", { vault }); // numbers off
    expect(text).not.toContain("482915");
  });

  it("still swaps an identifying number (postal) with numbers off", async () => {
    const vault: Vault = {};
    const { text } = await pseudonymize("code 75008", {
      complete: modelReturning([{ value: "75008", category: "POSTAL_CODE" }]),
      vault,
    });
    expect(text).not.toContain("75008");
  });

  it("keeps a UK alphanumeric postcode alphanumeric (no letter leak)", async () => {
    const vault: Vault = {};
    await pseudonymize("Office at SW1A 1AA please", {
      complete: modelReturning([{ value: "SW1A 1AA", category: "POSTAL_CODE" }]),
      vault,
      numbers: false,
    });
    const fake = fakeOf(vault, "SW1A 1AA")!;
    expect(fake).toMatch(/^[A-Za-z0-9]{4} [A-Za-z0-9]{3}$/); // same postcode shape
    expect(fake).not.toBe("SW1A 1AA");
  });
});

describe("overlapping detections are de-nested", () => {
  it("a name inside an email is ONE redaction (the email), not two", async () => {
    const input = "Contact : julien.sabourdin@gmail.com";
    const vault: Vault = {};
    const { matches, text } = await pseudonymize(input, {
      // The local NER flags the name INSIDE the email; the regex flags the email.
      detectLocal: async () => [{ value: "julien.sabourdin", category: "NAME" }],
      vault,
      numbers: false,
    });
    expect(matches).toHaveLength(1);
    expect(matches[0].category).toBe("EMAIL");
    expect(text).not.toContain("julien.sabourdin@gmail.com");
    // The email is faked exactly ONCE (one chip, de-nested — not a second NAME
    // redaction). The vault ALSO carries reverse-only name aliases (Nathan→Julien)
    // so a first name the model lifts from the fake local-part restores; those add
    // no chip (matches stays 1) but do appear as extra vault values.
    expect(
      Object.values(vault).filter((v) => v === "julien.sabourdin@gmail.com"),
    ).toHaveLength(1);
  });

  it("but a STANDALONE occurrence of the name IS still redacted", async () => {
    const input = "julien.sabourdin@gmail.com — signé Julien Sabourdin";
    const vault: Vault = {};
    const { matches } = await pseudonymize(input, {
      detectLocal: async () => [
        { value: "julien.sabourdin", category: "NAME" }, // nested in the email → dropped
        { value: "Julien Sabourdin", category: "NAME" }, // standalone → kept
      ],
      vault,
      numbers: false,
    });
    expect(matches).toHaveLength(2);
    expect(matches.map((m) => m.category).sort()).toEqual(["EMAIL", "NAME"]);
  });
});

describe("a COMPANY keeps ONE identity across casings", () => {
  it("re-mentions of a company in different casing map to the SAME fake company", async () => {
    // The model tags the ORG once; `detectWithModel` locates every casing in the
    // text. Both must become the SAME fake company (casing-variant), never two
    // identities and never a leak of the second occurrence.
    const input = "PV: president de la societe Karl studio. La societe Karl Studio ne versera pas.";
    const vault: Vault = {};
    const { text } = await pseudonymize(input, {
      complete: modelReturning([{ value: "Karl Studio", category: "ORG" }]),
      vault,
      numbers: false,
    });
    expect(text).not.toContain("Karl studio"); // 1st (lowercase) redacted
    expect(text).not.toContain("Karl Studio"); // 2nd (title-case) redacted — no leak
    // Both fakes share ONE company stem (a casing variant of the same word), so the
    // model sees a single company, not two.
    const fakes = Object.values(vault).length === 2 ? Object.keys(vault) : [];
    expect(fakes).toHaveLength(2);
    const stem = (s: string) => s.split(/\s+/)[0].toLowerCase();
    expect(stem(fakes[0])).toBe(stem(fakes[1]));
    expect(unredact(text, vault)).toBe(input); // fully reversible
  });
});

describe("a NAME keeps ONE identity across casings (no ALL-CAPS leak)", () => {
  it("re-mentions of a person in different casing map to the SAME fake, casing-matched", async () => {
    // The model tags the NAME once; `detectWithModel` locates every casing. An ALL-CAPS
    // occurrence used to reconstruct a fake but create NO vault entry, so `applyVault`
    // (case-sensitive) left it UNMAPPED and the real name LEAKED. Now every casing gets a
    // reversible entry recased to match (UPPER name → UPPER fake): one identity, no leak.
    const input = "Bonjour Léa Morvan. EN-TÊTE: LÉA MORVAN. sig: léa morvan.";
    const vault: Vault = {};
    const { text } = await pseudonymize(input, {
      complete: modelReturning([{ value: "Léa Morvan", category: "NAME" }]),
      vault,
      numbers: false,
    });
    // No casing of the real name survives in the wire.
    expect(text).not.toContain("Léa Morvan");
    expect(text).not.toContain("LÉA MORVAN"); // the ALL-CAPS leak this fixes
    expect(text).not.toContain("léa morvan");
    // Every full-name fake shares ONE first-name stem (case-insensitive) → one identity.
    const fullFakes = Object.keys(vault).filter((k) => /\s/.test(k));
    expect(fullFakes.length).toBeGreaterThanOrEqual(2);
    const stem = (s: string) => s.split(/\s+/)[0].toLowerCase();
    for (const f of fullFakes) expect(stem(f)).toBe(stem(fullFakes[0]));
    // The ALL-CAPS occurrence's fake is ALL-CAPS (casing-consistent).
    expect(fullFakes.some((f) => f === f.toUpperCase())).toBe(true);
    expect(unredact(text, vault)).toBe(input); // fully reversible
  });
});

describe("a PLACE (city/region) keeps ONE identity across casings", () => {
  it("re-mentions of a city in different casing map to the SAME fake city", async () => {
    // Like NAME/ORG: place kinds (city/region → "location", "address") went through
    // `fakeFor` on the exact value, so "Nantes"/"NANTES"/"nantes" each minted a DIFFERENT
    // fake city (three identities). Now they share ONE canonical fake, recased to match.
    const input = "Je vis à Nantes. NANTES est belle. née à nantes.";
    const vault: Vault = {};
    const { text } = await pseudonymize(input, {
      complete: modelReturning([{ value: "Nantes", category: "CITY" }]),
      vault,
      numbers: false,
    });
    expect(text).not.toContain("Nantes");
    expect(text).not.toContain("NANTES");
    expect(text).not.toContain("nantes");
    // Every fake is a casing-variant of ONE city (same stem, case-insensitive).
    const fakes = Object.keys(vault);
    expect(fakes.length).toBeGreaterThanOrEqual(2);
    for (const f of fakes) expect(f.toLowerCase()).toBe(fakes[0].toLowerCase());
    expect(unredact(text, vault)).toBe(input); // fully reversible
  });
});

describe("casing consistency extends to health / username / path", () => {
  const casings = (v: string, cat: string) =>
    [v, v.toUpperCase(), v.toLowerCase()].map((value) => ({ value, category: cat }));
  const detectLocal = (dets: { value: string; category: string }[]) => async (input: string) =>
    dets.filter((d) => input.includes(d.value)) as any;

  it("HEALTH: a diagnosis in 3 casings → ONE fake", async () => {
    const input = "Diagnostic: Diabète. Note: DIABÈTE. suivi diabète.";
    const vault: Vault = {};
    const { text } = await pseudonymize(input, {
      detectLocal: detectLocal(casings("Diabète", "HEALTH")),
      vault,
    });
    expect(text.toLowerCase()).not.toContain("diabète");
    const fakes = Object.keys(vault);
    for (const f of fakes) expect(f.toLowerCase()).toBe(fakes[0].toLowerCase()); // one identity
    expect(unredact(text, vault)).toBe(input);
  });

  it("PATH: the same file in a different casing → the SAME fake segments", async () => {
    const input = "voir /Users/Julien/Notes.md et /users/julien/notes.md";
    const vault: Vault = {};
    const { text } = await pseudonymize(input, {
      detectLocal: detectLocal([
        { value: "/Users/Julien/Notes.md", category: "PATH" },
        { value: "/users/julien/notes.md", category: "PATH" },
      ]),
      vault,
    });
    expect(text).not.toContain("Julien");
    expect(text).not.toContain("julien");
    // Both fake paths share the same distinctive fake segments (case-insensitive).
    const segs = text.match(/\/[Uu]sers\/([^/]+)\//g)!.map((s) => s.toLowerCase());
    expect(segs[0]).toBe(segs[1]);
    expect(unredact(text, vault)).toBe(input);
  });
});

describe("email-fragment gate (no partial email leak)", () => {
  it("suppresses a domain/ORG fragment confined to emails so the local-part can't leak", async () => {
    // The NER mis-tags the domain "gmail" as an ORG. Redacting it alone would swap only
    // the domain (`drovak@<fake>.com`) and LEAK the real local-part. The whole email is
    // caught atomically by the email rule; the "gmail" fragment must be dropped.
    const input = "email: drovak@gmail.com | email: drovak@gmail.com";
    const vault: Vault = {};
    const { text } = await pseudonymize(input, {
      complete: modelReturning([{ value: "gmail", category: "ORG" }]),
      vault,
      numbers: false,
    });
    expect(text).not.toContain("drovak"); // real local-part never leaks
    expect(text).not.toContain("gmail.com"); // real domain gone too (email rule replaced it whole)
    expect(text).not.toMatch(/drovak@\w+\.com/); // NOT a domain-only partial swap
    expect(unredact(text, vault)).toBe(input); // reversible
  });

  it("still redacts an ORG that ALSO appears outside an email", async () => {
    const input = "Acme Corp — contact billing@acme.com";
    const vault: Vault = {};
    const { text } = await pseudonymize(input, {
      complete: modelReturning([{ value: "Acme", category: "ORG" }]),
      vault,
      numbers: false,
    });
    expect(text).not.toContain("Acme Corp"); // standalone ORG occurrence still redacted
    expect(unredact(text, vault)).toBe(input);
  });
});

describe("generic terms — courtesy/titles/dates/roles coverage (deny-list audit)", () => {
  it("drops mail boilerplate, honorifics, days and unambiguous months", () => {
    for (const v of [
      "Bonjour", "Cordialement", "Merci", "Salutations",
      "Monsieur", "Madame", "Docteur", "Maître",
      "Lundi", "mercredi", "Sunday",
      "Janvier", "février", "Décembre", "July",
    ]) {
      expect(isGenericTerm(v)).toBe(true);
    }
  });

  it("drops role / transaction / tech KIND words a NER standalone-tags", () => {
    for (const v of [
      "Client", "Fournisseur", "Prestataire", "Collaborateur", "Manager", "Équipe",
      "R.H.", "PDG", "Commande", "Livraison", "Paiement", "Réunion", "Rendez-vous",
      "Serveur", "Logiciel", "Wi-Fi", "Base de données",
    ]) {
      expect(isGenericTerm(v)).toBe(true);
    }
  });

  it("keeps the AMBIGUOUS date words OUT (real first names / surnames)", () => {
    // mars/avril/mai + march/april/may/june/august double as people — the allow-list
    // discipline omits them so a person named Avril/June is never permanently leaked.
    for (const v of ["mars", "avril", "mai", "march", "april", "may", "june", "august"]) {
      expect(isGenericTerm(v)).toBe(false);
    }
  });
});

describe("CONSTAT PARCOURS 15/08 — une casse de plus, dans un coffre PRÉ-CHARGÉ", () => {
  /**
   * The thread of one turn had « KARL STUDIO » and « KARLSTUDIO » masked and
   * « Karl Studio » not. The finding concluded "the deterministic engine is not at
   * fault" — a probe in ONE pass does unify all three casings. The bug only appears
   * with a vault ALREADY populated, i.e. exactly the situation of a tool
   * result: the previous document had vaulted the company as an ORGANISATION (a
   * whole-value entry, no per-word alias), and since « Karl » is a first name in the lexicon,
   * the new occurrence went through the NAME machinery — which minted a second identity.
   */
  const coffre = (real: string): Vault => ({ "Célestin Chastanet": real });

  it("une entité déjà au coffre garde SON faux, quelle que soit la casse", async () => {
    const v = coffre("KARL STUDIO");
    const r = await pseudonymize("Karl Studio a signé le procès-verbal.", { vault: v });
    expect(r.text).toContain("Célestin Chastanet");
    expect(r.text).not.toContain("Karl Studio");
    // …and above all: NO second identity is created for the same company.
    expect(Object.values(v).filter((x) => /karl studio/i.test(x))).toHaveLength(1);
  });

  it("dans l'autre sens aussi, et la casse de l'occurrence est respectée", async () => {
    const v = coffre("Karl Studio");
    const r = await pseudonymize("KARL STUDIO a signé.", { vault: v });
    expect(r.text).toContain("CÉLESTIN CHASTANET");
    expect(r.text).not.toContain("KARL STUDIO");
  });

  it("⚠️ le comportement des catégories qui marchaient déjà n'a pas bougé", async () => {
    // `company`/`location`/… have always gone through `resolveEntityFakeCI`: it's
    // NAME that was the only gap.
    const v = coffre("VOXA LABS");
    expect((await pseudonymize("Voxa Labs a signé.", { vault: v })).text)
      .toContain("Célestin Chastanet");
  });

  it("…et une entité INCONNUE du coffre reçoit bien un faux neuf", async () => {
    const v = coffre("KARL STUDIO");
    const r = await pseudonymize("Ambre Delrieux a signé.", { vault: v });
    expect(r.text).not.toContain("Ambre Delrieux");
    expect(r.text).not.toContain("Célestin Chastanet");
  });
});

describe("un libellé de PERSONNE contraint le type d'une source probabiliste (16/08/2026)", () => {
  /**
   * Measured with the local NER IN THE LOOP, which is what the 15/08 walkthrough
   * finding called for: on an ISOLATED line, « Salarié: Gwendal Kervoal » came out as
   * « Salarié: Aix-en-Provence » — the employee turned into a CITY — and « Soizic Quéméner »
   * into a COMPANY. Breton names whose second term is also a commune: the NER
   * decides from the shape, the label knew better. Here the NER is simulated so the case holds
   * as a unit test, with no weights or model.
   */
  const nerDit = (value: string, category: string) => () =>
    Promise.resolve([{ value, category }]);

  it("le NER dit VILLE, le libellé dit salarié — c'est une personne", async () => {
    const v: Vault = {};
    const r = await pseudonymize("Salarié: Gwendal Kervoal", {
      vault: v,
      detectLocal: nerDit("Gwendal Kervoal", "CITY"),
    });
    expect(r.matches.find((m) => m.value === "Gwendal Kervoal")?.category).toBe("NAME");
    expect(r.text).not.toContain("Kervoal");
  });

  it("⚠️ mais une vraie ORGANISATION sous un libellé de personne garde son type", async () => {
    // The bound the finding required: a person is never a place, so that
    // direction can be corrected safely — whereas a « Contact : Acme SARL » is a REAL
    // company in a mis-labeled column, and overwriting it as a NAME would be the opposite bug.
    const v: Vault = {};
    const r = await pseudonymize("Contact: Brantley Systems SARL", {
      vault: v,
      detectLocal: nerDit("Brantley Systems SARL", "ORG"),
    });
    expect(r.matches.find((m) => /Brantley/.test(m.value))?.category).not.toBe("NAME");
  });

  it("…et un libellé GÉO n'est pas touché", async () => {
    const v: Vault = {};
    const r = await pseudonymize("Ville: Kervoal", {
      vault: v,
      detectLocal: nerDit("Kervoal", "CITY"),
    });
    expect(r.matches.find((m) => m.value === "Kervoal")?.category).toBe("CITY");
  });
});

describe("la forme COLLÉE d'une entité connue — un domaine (16/08/2026)", () => {
  /** Bench for personas ACROSS A CONVERSATION: turn 1 vaults « Karl Studio », the tool returns
   *  « karlstudio.fr » on turn 2, and the allocator used to mint a NEW identity — the company
   *  ending up behind two unrelated fakes, one of them a PERSON, and its site attributed to
   *  someone else. `applyVaultVariants` ALREADY mapped this spelling at the end of the pass:
   *  the two disagreed, the allocator claiming the value first. */
  it("le tour 2 réutilise l'identité du tour 1", async () => {
    const vault: Vault = {};
    await pseudonymize("Conclusions contre la SAS Karl Studio.", { vault, reFakeExisting: true });
    const fauxT1 = Object.entries(vault).find(([, v]) => /karl studio/i.test(v))?.[0];
    expect(fauxT1).toBeTruthy();

    await pseudonymize("[greffe] KARL STUDIO — karlstudio.fr — actif", { vault });
    const cle = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
    // Every entry whose REAL is the same entity must carry the SAME fake, except for
    // casing — one entry per casing is intended, one identity per spelling is not.
    const identites = new Set(
      Object.entries(vault)
        .filter(([, v]) => cle(v).includes("karlstudio"))
        .map(([f]) => cle(f)),
    );
    expect(identites.size).toBe(1);
  });
});
