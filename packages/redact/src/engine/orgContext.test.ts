import { describe, it, expect } from "vitest";
import { detectOrgContext } from "./orgContext";
import { pseudonymize } from "../model/pseudonymize";

const values = (text: string): string[] => detectOrgContext(text).map((d) => d.value);

describe("detectOrgContext — legal-form suffix", () => {
  it("catches a lowercase company before a legal form, CANONICALISED (suffix stays clear)", () => {
    // The emitted value is affix-stripped so "berlioz sarl" and the LLM's
    // "Berlioz" share one entityKey → ONE fake for the company.
    expect(values("le devis de batim sarl est arrivé")).toEqual(["batim"]);
    expect(values("der vertrag mit acme gmbh läuft")).toEqual(["acme"]);
  });

  it("captures up to two name tokens", () => {
    expect(values("facture adressée à batim ouest sarl hier")).toEqual(["batim ouest"]);
  });

  it("never fires on an article/adjective before the form", () => {
    expect(values("la sarl est en litige")).toEqual([]);
    expect(values("une petite sarl familiale")).toEqual([]);
    expect(values("un double sas d'entrée sécurise le hall")).toEqual([]);
  });

  it("an invalid token BETWEEN name and suffix disqualifies the match", () => {
    expect(values("voir berlioz la sarl")).toEqual([]);
  });

  it("does not cross a legal form glued into a longer word", () => {
    expect(values("l'esprit de corps est fort")).toEqual([]); // "corps" ≠ "corp"
  });
});

describe("detectOrgContext — gated profession plural", () => {
  it("fires only WITH a leading org gate word", () => {
    expect(values("signature chez berlioz avocats la semaine prochaine")).toEqual(["berlioz avocats"]);
    expect(values("rendez-vous cabinet ferrand notaires jeudi")).toEqual(["ferrand notaires"]);
  });

  it("never fires on the bare plural (food/prose)", () => {
    expect(values("salade avocats crevettes pour midi")).toEqual([]);
    expect(values("les avocats ont plaidé")).toEqual([]);
    expect(values("chez les avocats du barreau")).toEqual([]); // gate + stopword token
  });
});

describe("detectOrgContext — identity unification with the LLM source", () => {
  it("one company = ONE fake when the deterministic and LLM sources both see it", async () => {
    // Regression: the deterministic sources don't pass the detector-level affix
    // strip, so "berlioz sarl" and the LLM's "Berlioz" used to get two entityKeys
    // → two unrelated fakes for one firm.
    const vault: Record<string, string> = {};
    const complete = async () => '[{"value": "Berlioz", "category": "ORG"}]';
    const r = await pseudonymize("Je bosse chez berlioz sarl. Le cabinet Berlioz me défend.", {
      vault,
      complete,
    });
    expect(r.text).not.toMatch(/berlioz/i); // both spellings redacted
    const fakes = Object.entries(vault)
      .filter(([, orig]) => orig.toLowerCase().includes("berlioz"))
      .map(([fake]) => fake.toLowerCase());
    expect(fakes.length).toBeGreaterThan(0);
    expect(new Set(fakes).size).toBe(1); // one identity, casing aliases only
  });
});

describe("detectOrgContext — conjunction family", () => {
  it("catches '<name> & fils' / '& partners' style firms", () => {
    expect(values("le camion de savary & fils est passé")).toEqual(["savary & fils"]);
    expect(values("commande envoyée à muller und partner ce matin")).toEqual(["muller und partner"]);
  });

  it("never fires on kinship prose", () => {
    expect(values("une dispute entre père et fils")).toEqual([]);
    expect(values("un problème entre madre e hijos")).toEqual([]);
  });
});

describe("detectOrgContext — family 4: financial-statement header pair", () => {
  const detect = (text: string) => detectOrgContext(text);
  const orgs = (text: string) =>
    detect(text).filter((d) => d.category === "ORG").map((d) => d.value);
  const ids = (text: string) =>
    detect(text).filter((d) => d.category === "COMPANY_ID").map((d) => d.value);

  it("a denomination line directly above a bare 14-digit line yields ORG + COMPANY_ID", () => {
    const t = "KARL STUDIO\n91186429738250\nCompte de résultat 2024";
    expect(orgs(t)).toEqual(["KARL STUDIO"]);
    expect(ids(t)).toEqual(["91186429738250"]); // Luhn-INVALID on purpose (OCR'd)
  });

  it("9-digit SIREN, Title-Case name, one blank line between — all tolerated", () => {
    const t = "Berlioz Conseil\n\n775 384 225\n";
    expect(orgs(t)).toEqual(["Berlioz Conseil"]);
    expect(ids(t)).toEqual(["775 384 225"]);
  });

  it("a table label above a fused digit column never qualifies (lowercase content word)", () => {
    expect(detect("Total des produits d’exploitation\n123456789\n")).toEqual([]);
  });

  it("an all-generic document title never qualifies", () => {
    expect(detect("COMPTE DE RESULTAT\n91186429738250\n")).toEqual([]);
  });

  it("a label line (colon) or a letters-in-digits line never qualifies", () => {
    expect(detect("Dossier : KARL STUDIO\n91186429738250\n")).toEqual([]);
    expect(detect("KARL STUDIO\nREF 91186429738250\n")).toEqual([]);
  });
});

describe("« & Filles » / « & Frères » — le symétrique exact de « & Fils »", () => {
  it("reconnaît la raison sociale au féminin comme au masculin", () => {
    const v = (s: string) => detectOrgContext(s).map((d) => d.value);
    expect(v("en-tête\nCABINET VEYRAT & FILLES\nExpertise comptable")).toContain("VEYRAT & FILLES");
    expect(v("Établissements Morvan & Frères, 3 rue Bara")).toContain("Morvan & Frères");
  });

  it("mais la prose familiale reste de la prose", () => {
    // Le garde KINSHIP borne le jeton de GAUCHE : c'est lui qui distingue une maison
    // d'un partage entre enfants.
    expect(detectOrgContext("il partage entre père et filles le produit de la vente")).toEqual([]);
  });
});

describe("dénominations en CAPITALES — le suffixe certifie le nom ENTIER", () => {
  const v = (s: string) => detectOrgContext(s).map((d) => d.value);

  it("un mot générique CAPITALISÉ est de la matière de dénomination", () => {
    // « ATELIER » / « SANTÉ » sont génériques — les élaguer laissait « VERNE » seul,
    // sous le plancher de couverture des bancs. Le suffixe légal certifie le tout.
    expect(v("embauchée par ATELIER VERNE SARL à compter du 01/09/2021")).toContain("ATELIER VERNE");
    expect(v("Preneur : KELVEA SANTÉ SASU")).toContain("KELVEA SANTÉ");
  });

  it("un stopword TOUT-EN-CAPITALES compte dans un nom certifié par sa forme", () => {
    // « vieux » est un stopword — « SCI DU VIEUX PORT » est une dénomination gravée.
    expect(v("Bailleur : SCI DU VIEUX PORT")).toContain("DU VIEUX PORT");
  });

  it("« la société anonyme » et « La Sarl » restent de la prose", () => {
    expect(v("la société anonyme a été dissoute")).toEqual([]);
    expect(v("La Sarl a déposé le bilan")).toEqual([]);
  });

  it("la famille « & Fils » remonte le nom de métier en tête", () => {
    expect(v("établi par CHARPENTES MARQUET & FILS SARL pour le compte de")).toContain(
      "CHARPENTES MARQUET & FILS",
    );
  });

  it("« SL » espagnol est un suffixe ; la famille grimpe à trois tokens", () => {
    expect(v("- PANADERÍA LOS OLIVOS SL")).toContain("PANADERÍA LOS OLIVOS");
  });
});

describe("suffixes nordiques (AS/AB/OY/BV) — sensibles à la casse, jamais l'anglais", () => {
  const v = (s: string) => detectOrgContext(s).map((d) => d.value);

  it("reconnaît une dénomination de registre en capitales", () => {
    expect(v("- HANSEN & BREKKE AS")).toContain("HANSEN & BREKKE AS");
  });

  it("l'anglais en capitales ne tire jamais", () => {
    // « AS » suivi d'un mot en capitales est une tournure anglaise, pas un registre.
    expect(v("SAVE AS PDF")).toEqual([]);
    expect(v("MARKED AS PAID")).toEqual([]);
    expect(v("AS SOON AS POSSIBLE")).toEqual([]);
    expect(v("le résultat est correct as usual")).toEqual([]);
  });
});
