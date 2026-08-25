import { describe, expect, it } from "vitest";
import { pseudonymize } from "./pseudonymize";
import { filterCandidates } from "./pseudonymize/filter";
import { isNotoriousEntity } from "./notorious";
import type { Detection, Vault } from "../types";

// Simulate the AI detector (same harness as aiKinds.test.ts): `complete` returns the
// findings as the JSON array `detectWithModel` expects.
function modelReturning(findings: { value: string; category: string }[]) {
  return async () => JSON.stringify(findings);
}

describe("isNotoriousEntity — category-scoped allow-list", () => {
  it("famous people match the NAME category, case/accent/separator-insensitively", () => {
    for (const v of ["Albert Einstein", "einstein", "ALBERT-EINSTEIN", "Napoléon", "napoleon"]) {
      expect(isNotoriousEntity(v, "name")).toBe(true);
    }
    // An unknown private person is never spared.
    expect(isNotoriousEntity("Jean Vialet", "name")).toBe(false);
  });

  it("tickers, indices, émetteurs et organismes publics matchent la catégorie COMPANY", () => {
    for (const v of ["CAC 40", "S&P 500", "PSI", "SPY", "USO", "Yahoo Finance", "IAU",
      "Pôle emploi", "Assurance Maladie", "Sacem", "Pacifica", "Datadog", "AWS"]) {
      expect(isNotoriousEntity(v, "company"), v).toBe(true);
    }
    expect(isNotoriousEntity("Karl Studio", "company")).toBe(false);
  });

  it("⚠️ les MARQUES COMMERCIALES ne sont PLUS dispensées PAR DÉFAUT (décision produit 27/07/2026)", () => {
    // « Google » est de notoriété publique, mais « je travaille chez Google » /
    // « le dossier BNP Paribas avance » nomment l'employeur ou le client de celui qui
    // écrit — une relation d'affaires, pas une connaissance générale. Ce qui reste
    // dispensé (organismes publics, émetteurs de courrier, outillage, indices) est
    // vérifié juste au-dessus : c'est la frontière, pas une exception.
    // Depuis le 30/07/2026 la dispense revient en OPT-IN par niveau (`commercial: true`,
    // Standard/Renforcé) — le bloc « dispense COMMERCIALE opt-in » ci-dessous. SANS le
    // flag, le comportement du 27/07 est le contrat, et ce test l'épingle.
    for (const v of ["Apple", "apple", "LVMH", "Société Générale", "BNP Paribas",
      "Airbus", "Renault", "Carrefour", "Goldman Sachs"]) {
      expect(isNotoriousEntity(v, "company"), v).toBe(false);
    }
  });

  it("a fund ISSUER'S product name is spared as a whole (prefix rule, issuers only)", () => {
    for (const v of [
      "Invesco Semiconductors ETF",
      "United States Oil Fund",
      "VanEck Oil Services",
      "Direxion Daily S&P Biotech Bull 3X Shares",
    ]) {
      expect(isNotoriousEntity(v, "company")).toBe(true);
    }
    // A generic famous brand does NOT own a prefix namespace — a private company
    // leading with one must stay redactable.
    expect(isNotoriousEntity("Apple Consulting", "company")).toBe(false);
  });

  it("countries match the LOCATION category only, via the curated geo list", () => {
    for (const v of ["France", "Allemagne", "Deutschland", "United States", "États-Unis"]) {
      expect(isNotoriousEntity(v, "location")).toBe(true);
    }
    // Country/name homonyms are simply absent from the curated list.
    expect(isNotoriousEntity("Jordan", "location")).toBe(false);
    expect(isNotoriousEntity("Georgia", "location")).toBe(false);
  });

  it("a TICKER is spared under ANY category (a NER tags SPY/AAPL as PERSON), all-caps only", () => {
    // Regression: SPY→"Léa", AAPL→"Antoine", TSLA→"Paul" in a run_python result — the
    // symbols were tagged as person names, so the company-scoped check missed them.
    for (const cat of ["name", "company", "location", "sensitive"]) {
      expect(isNotoriousEntity("SPY", cat)).toBe(true);
      expect(isNotoriousEntity("AAPL", cat)).toBe(true);
      expect(isNotoriousEntity("IAU", cat)).toBe(true);
    }
    // Lowercase prose is NOT a ticker ("a spy", "paul") — still redactable as a name.
    expect(isNotoriousEntity("spy", "name")).toBe(false);
    expect(isNotoriousEntity("Spy", "name")).toBe(false);
  });

  it("a COUNTRY mis-tagged as an ORG is spared (the state is world knowledge)", () => {
    for (const v of ["France", "Allemagne", "Espagne", "Italie", "Deutschland"]) {
      expect(isNotoriousEntity(v, "company")).toBe(true);
    }
  });

  it("ubiquitous products are spared as COMPANY, never as a NAME (Claude, Gemini…)", () => {
    for (const v of ["Excel", "Windows", "iPhone", "ChatGPT", "Claude", "Gemini", "Copilot"]) {
      expect(isNotoriousEntity(v, "company")).toBe(true);
    }
    // The first-name readings keep their protection: M. Claude / Gemini Dupont.
    expect(isNotoriousEntity("Claude", "name")).toBe(false);
    expect(isNotoriousEntity("Gemini", "name")).toBe(false);
  });

  it("the scoping is strict: the same string under another category is NOT spared", () => {
    expect(isNotoriousEntity("France", "name")).toBe(false); // a first name
    expect(isNotoriousEntity("Apple", "name")).toBe(false); // a surname
    expect(isNotoriousEntity("Hermès", "name")).toBe(false); // M. Hermès, private person
    expect(isNotoriousEntity("Tesla", "name")).toBe(false); // a private surname
    expect(isNotoriousEntity("Albert Einstein", "company")).toBe(false);
  });
});

describe("filterCandidates — notorious gate interplay with forced/unrevealable", () => {
  const base = {
    keep: new Set<string>(),
    isExistingFake: () => false,
    disabled: new Set<string>(),
    urlSpans: null,
    emailSpans: null,
    input: "tu connais Pôle emploi ?",
  };
  // Un organisme PUBLIC : les marques commerciales ne sont plus dispensées, donc le
  // témoin de cette porte doit être quelque chose qu'elle épargne toujours.
  const apple: Detection[] = [{ value: "Pôle emploi", category: "ORG" }];

  it("drops a notorious entity, but user-`forced` still wins (explicit ask)", () => {
    expect(filterCandidates(apple, base).map((c) => c.value)).not.toContain("Pôle emploi");
    const forced: Detection[] = [{ value: "Pôle emploi", category: "ORG", forced: true }];
    expect(filterCandidates(forced, base).map((c) => c.value)).toContain("Pôle emploi");
  });

  it("an org-MANDATED category outranks notoriety (member cannot reveal it)", () => {
    const kept = filterCandidates(apple, { ...base, unrevealable: new Set(["company"]) });
    expect(kept.map((c) => c.value)).toContain("Pôle emploi");
  });
});

describe("pseudonymize — notorious entities keep the conversation PRISTINE", () => {
  it("a world-knowledge question ships verbatim and mints NOTHING (empty vault)", async () => {
    const vault: Vault = {};
    // « Apple » est SORTI de cet exemple : une marque commerciale est désormais redacted.
    // Ce que ce test protège reste entier — personnalité, organisme public, pays.
    const input = "Qui est Albert Einstein ? Tu connais Pôle emploi ? Et la France ?";
    const { text } = await pseudonymize(input, {
      complete: modelReturning([
        { value: "Albert Einstein", category: "NAME" },
        { value: "Pôle emploi", category: "ORG" },
        { value: "France", category: "LOCATION" },
      ]),
      vault,
      numbers: false,
    });
    expect(text).toBe(input);
    expect(Object.keys(vault)).toHaveLength(0);
  });

  it("an unknown private person is still redacted next to a famous one", async () => {
    const vault: Vault = {};
    const { text } = await pseudonymize("Albert Einstein a inspiré Jean Vialet.", {
      complete: modelReturning([
        { value: "Albert Einstein", category: "NAME" },
        { value: "Jean Vialet", category: "NAME" },
      ]),
      vault,
      numbers: false,
    });
    expect(text).toContain("Albert Einstein");
    expect(text).not.toContain("Jean Vialet");
    expect(Object.values(vault)).toContain("Jean Vialet");
  });

  it("REGRESSION (Yahoo Finance loop): public market data in a tool result stays verbatim", async () => {
    const vault: Vault = {};
    const input = [
      "PSI: longName='Invesco Semiconductors ETF', instrumentType='ETF'",
      "USO: longName='United States Oil Fund', instrumentType='ETF'",
      "LABU: longName='Direxion Daily S&P Biotech Bull 3X Shares'",
      "OIH: longName='VanEck Oil Services ETF'",
    ].join("\n");
    const { text } = await pseudonymize(input, {
      complete: modelReturning([
        { value: "PSI", category: "ORG" },
        { value: "USO", category: "ORG" },
        { value: "LABU", category: "ORG" },
        { value: "OIH", category: "ORG" },
        { value: "Invesco Semiconductors ETF", category: "ORG" },
        { value: "United States Oil Fund", category: "ORG" },
        { value: "Direxion Daily S&P Biotech Bull 3X Shares", category: "ORG" },
        { value: "VanEck Oil Services ETF", category: "ORG" },
      ]),
      vault,
      numbers: false,
    });
    expect(text).toBe(input);
    expect(Object.keys(vault)).toHaveLength(0);
  });
});

describe("state institutions — « gouvernement français » is world knowledge", () => {
  // The reported bug: « composition du gouvernement français actuel » had its subject
  // faked to a nonsense token — the model answered about nobody's government. An
  // institution-of-a-country phrase (ORG or LOC span) is spared like the country itself.
  it("spares institution + demonym phrases under company AND location", () => {
    for (const v of [
      "gouvernement français", "le gouvernement français", "German parliament",
      "administration américaine", "ministère français", "parlement européen",
    ]) {
      expect(isNotoriousEntity(v, "company"), v).toBe(true);
      expect(isNotoriousEntity(v, "location"), v).toBe(true);
    }
  });

  it("NEVER spares a company name that merely carries a demonym — the leak this design avoids", () => {
    // « société » is already a GENERIC word: had the demonyms joined `genericTerms`, the
    // compound gate would have DROPPED "Société Française …" — the start of countless
    // real company names. The institution-word requirement is what blocks that.
    for (const v of ["Société Française", "Société Française de Cardiologie", "Banque Française"]) {
      expect(isNotoriousEntity(v, "company"), v).toBe(false);
    }
  });

  it("category scoping holds — a PERSON surnamed « Français » keeps their protection", () => {
    expect(isNotoriousEntity("Français", "name")).toBe(false);
    expect(isNotoriousEntity("gouvernement français", "name")).toBe(false);
  });
});

describe("dispense COMMERCIALE opt-in — `commercial: true` (niveaux Standard/Renforcé)", () => {
  const commercial = { commercial: true };

  it("avec le flag, les grandes marques sont dispensées sous COMPANY ; sans, redacted", () => {
    for (const v of ["Google", "Apple", "LVMH", "BNP Paribas", "Société Générale",
      "Airbus", "Renault", "Carrefour", "Goldman Sachs", "TotalEnergies"]) {
      expect(isNotoriousEntity(v, "company", commercial), v).toBe(true);
      expect(isNotoriousEntity(v, "company"), v).toBe(false);
      expect(isNotoriousEntity(v, "company", { commercial: false }), v).toBe(false);
    }
  });

  it("le scoping par catégorie tient MÊME avec le flag — un particulier au patronyme-marque reste protégé", () => {
    // C'est la raison pour laquelle la dispense passe par le moteur et non par `keep`
    // (qui est aveugle à la catégorie) : M. Hermès, Mme Renault, M. Leclerc.
    for (const v of ["Hermès", "Tesla", "Renault", "Leclerc", "Michelin", "Chanel", "Dior"]) {
      expect(isNotoriousEntity(v, "name", commercial), v).toBe(false);
    }
  });

  it("une marque MULTI-mots taguée NAME est l'org mal lue (dispensée avec le flag) ; un mot seul jamais", () => {
    expect(isNotoriousEntity("BNP Paribas", "name", commercial)).toBe(true);
    expect(isNotoriousEntity("Goldman Sachs", "name", commercial)).toBe(true);
    expect(isNotoriousEntity("BNP Paribas", "name")).toBe(false); // sans flag : inchangé
    expect(isNotoriousEntity("Renault", "name", commercial)).toBe(false);
  });

  it("pseudonymize bout en bout : la marque part en clair avec le flag, redacted sans", async () => {
    const input = "Que penses-tu de Google et de LVMH ?";
    const detect = modelReturning([
      { value: "Google", category: "ORG" },
      { value: "LVMH", category: "ORG" },
    ]);
    const clear: Vault = {};
    const on = await pseudonymize(input, {
      complete: detect, vault: clear, numbers: false, commercialNotoriety: true,
    });
    expect(on.text).toBe(input);
    expect(Object.keys(clear)).toHaveLength(0);
    const masked: Vault = {};
    const off = await pseudonymize(input, { complete: detect, vault: masked, numbers: false });
    expect(off.text).not.toContain("Google");
    expect(off.text).not.toContain("LVMH");
    expect(Object.values(masked)).toContain("Google");
  });

  it("« je travaille chez Google » reste redacted même avec le flag (rattachement à la 1re personne)", async () => {
    // La notoriété dit que l'entité est publique, jamais que la RELATION l'est —
    // la porte `isSelfBoundEntity` l'emporte sur la dispense, flag compris.
    const vault: Vault = {};
    const { text } = await pseudonymize("je travaille chez Google depuis mars.", {
      complete: modelReturning([{ value: "Google", category: "ORG" }]),
      vault,
      numbers: false,
      commercialNotoriety: true,
    });
    expect(text).not.toContain("Google");
    expect(Object.values(vault)).toContain("Google");
  });

  it("les intégrations MCP de l'app sont dans la dispense commerciale (échantillon ; la parité complète est côté app)", () => {
    // Le test exhaustif lit le catalogue : `packages/ui/src/privacy/notorietyCatalogParity.test.ts`.
    for (const v of ["Canva", "Gmail", "Google Drive", "Stripe", "Notion", "Sentry",
      "Supabase", "monday.com", "Hugging Face", "PostHog"]) {
      expect(isNotoriousEntity(v, "company", commercial), v).toBe(true);
      expect(isNotoriousEntity(v, "company"), v).toBe(false); // Strict : redacted
    }
  });

  it("une catégorie MANDATÉE par l'org l'emporte sur la dispense commerciale aussi", () => {
    const google: Detection[] = [{ value: "Google", category: "ORG" }];
    const base = {
      keep: new Set<string>(),
      isExistingFake: () => false,
      disabled: new Set<string>(),
      urlSpans: null,
      emailSpans: null,
      notoriety: { commercial: true },
      input: "le contrat Google est signé",
    };
    expect(filterCandidates(google, base).map((c) => c.value)).not.toContain("Google");
    const kept = filterCandidates(google, { ...base, unrevealable: new Set(["company"]) });
    expect(kept.map((c) => c.value)).toContain("Google");
  });
});

describe("dispense PERSONNALITÉS — opt-out `people: false` (le niveau Strict)", () => {
  it("dispensées par défaut ; redacted avec people:false — pays et tickers inchangés", () => {
    expect(isNotoriousEntity("Albert Einstein", "name")).toBe(true);
    expect(isNotoriousEntity("Albert Einstein", "name", { people: false })).toBe(false);
    expect(isNotoriousEntity("Macron", "name", { commercial: true, people: false })).toBe(false);
    // Un pays redacted fait dériver le modèle sur une autre géographie — dispensé
    // même en Strict ; idem le ticker (une valeur de marché n'identifie personne).
    expect(isNotoriousEntity("France", "location", { people: false })).toBe(true);
    expect(isNotoriousEntity("SPY", "name", { people: false })).toBe(true);
  });

  it("pseudonymize bout en bout : Strict (people:false) redacted Einstein, le défaut le laisse", async () => {
    const input = "Qui est Albert Einstein ?";
    const detect = modelReturning([{ value: "Albert Einstein", category: "NAME" }]);
    const strict: Vault = {};
    const off = await pseudonymize(input, {
      complete: detect, vault: strict, numbers: false, peopleNotoriety: false,
    });
    expect(off.text).not.toContain("Albert Einstein");
    expect(Object.values(strict)).toContain("Albert Einstein");
    const clear: Vault = {};
    const on = await pseudonymize(input, { complete: detect, vault: clear, numbers: false });
    expect(on.text).toBe(input);
    expect(Object.keys(clear)).toHaveLength(0);
  });
});

describe("Cdiscount — deux marques notoires doivent recevoir le même traitement", () => {
  it("est dispensée comme les autres enseignes, hors Strict", () => {
    // Mesuré le 14/08 : « Cdiscount » partait en « Voxa Labs » dans l'envoi même où
    // « MAIF » restait en clair. Une marque d'e-commerce sur un relevé est le
    // FOURNISSEUR, jamais l'identité du lecteur.
    expect(isNotoriousEntity("Cdiscount", "company", { commercial: true })).toBe(true);
    expect(isNotoriousEntity("MAIF", "company", { commercial: true })).toBe(true);
    // ⚠️ Les deux ne sont PAS dans la même famille, et c'est voulu : MAIF est un en-tête
    // d'EXPÉDITEUR (assureur), dispensé même en Strict ; Cdiscount est une marque
    // COMMERCIALE, donc dispensée seulement hors Strict. Ce que le constat pointait n'est
    // pas cette asymétrie-là, c'est que Cdiscount ne figurait NULLE PART.
    expect(isNotoriousEntity("Cdiscount", "company")).toBe(false);
    expect(isNotoriousEntity("MAIF", "company")).toBe(true);
  });
});

describe("la FORME JURIDIQUE ne doit pas rater la dispense (constat 15/08, relevé réel)", () => {
  const spared = (v: string) => isNotoriousEntity(v, "company", { commercial: true });

  /** En Renforcé, sur les libellés de contreparties d'un vrai relevé : « Ovh Sas » et
   *  « Github, Inc. » étaient REDACTED alors que la politique les dispense, pendant qu'un
   *  vrai client partait en clair — l'inverse de l'intention. */
  it("une marque connue reste dispensée sous son libellé bancaire", () => {
    for (const v of ["Ovh Sas", "OVH SAS", "GitHub Inc", "Github, Inc.", "Orange SARL"]) {
      expect(spared(v)).toBe(true);
    }
  });

  it("⚠️ et la borne tient : un nom ORDINAIRE + forme juridique n'est PAS dispensé", () => {
    // C'est ce qui sépare l'extension d'une exposition acceptée d'une nouvelle : seul le
    // NOYAU compte, et il doit être dans la liste.
    for (const v of ["Karl Studio SAS", "Apple Consulting", "Lestricolores", "Indy Comptabilite"]) {
      expect(spared(v)).toBe(false);
    }
  });

  it("…et le croisement NAME garde SA borne : le mot SEUL n'est jamais dispensé", () => {
    // « Orange SARL » étiqueté NAME EST dispensé — c'est le croisement multi-mots que ce
    // fichier documente déjà (une org mal lue en personne ; aucun particulier ne porte la
    // raison sociale entière). Ce qui protège une personne, c'est que le mot SEUL ne l'est
    // jamais : une vraie personne nommée Orange reste redacted.
    expect(isNotoriousEntity("Orange SARL", "name", { commercial: true })).toBe(true);
    expect(isNotoriousEntity("Orange", "name", { commercial: true })).toBe(false);
    // …et un nom de personne dont un mot ressemble à une marque n'est pas touché non plus.
    expect(isNotoriousEntity("Camille Orange", "name", { commercial: true })).toBe(false);
  });
});
