import { describe, expect, it } from "vitest";
import { isGenericTerm, isGenericCompound, isStopword } from "./genericTerms";
import { isNotoriousEntity } from "./notorious";
import { filterCandidates } from "./pseudonymize/filter";
import type { Detection } from "../types";

/* The over-redaction regression, taken FROM the report that produced it: an insurance /
   credit letter came back with 81 "redactions", of which the great majority were the
   document's own institutional vocabulary — « garantie », « assurance maladie »,
   « Registre des Intermédiaires en Assurance », « Siège social », « foyer fiscal »,
   « de courtage d'assurances ». Each was replaced by an invented company or person, so
   the model read a letter from nobody, about nobody.

   These words are never an identity on their own, so they are covered by the shared
   deny-lists (`vocab/admin.ts`) — and the point of testing them HERE, at the
   `filterCandidates` choke point, is that the drop must hold for EVERY detector: the LLM,
   the offline NER and the deterministic ones all pass through it. */

const ctx = {
  keep: new Set<string>(),
  isExistingFake: () => false,
  disabled: new Set<string>(),
  urlSpans: null,
  emailSpans: null,
  input: "",
};

/** What survives `filterCandidates` for a set of detected spans. */
const surviving = (values: string[], category = "company"): string[] =>
  filterCandidates(
    values.map((value) => ({ value, category }) as Detection),
    { ...ctx, input: values.join("\n") },
  ).map((c) => c.value);

describe("institutional vocabulary is not an identity", () => {
  it("drops the standalone words the report flagged", () => {
    for (const v of [
      "garantie", "GARANTIE", "Garanties", "assurance", "'assurance", "'Assurance",
      "courtage", "maladie", "anonyme", "libéré", "Assuré", "DISTANCE", "état",
      "mensualités", "revenus", "autonomie", "commission", "registre", "sinistre",
    ]) {
      expect(isGenericTerm(v), v).toBe(true);
    }
  });

  it("drops the institutional PHRASES, because every word is covered", () => {
    for (const v of [
      "Registre des Intermédiaires en Assurance",
      "Caisse régionale de Crédit Agricole Mutuel",
      "Caisse Régionale du Crédit Agricole",
      "Caisse primaire",
      "de courtage d'assurances",
      "Autonomie des Personnes Handicapées",
      "Commission des Droits et de l'Autonomie",
      "assurance maladie",
      "Siège social",
      "foyer fiscal",
      "Convention AERAS",
      "Caisse d'Épargne",
    ]) {
      expect(isGenericCompound(v), v).toBe(true);
    }
  });

  it("covers the administrative acronyms, dotted or not, across countries", () => {
    for (const v of [
      // FR
      "DPE", "ITT", "PTIA", "FICP", "CDAPH", "AERAS", "MDPH", "d.p.e",
      // DE/AT/CH · UK · ES · IT · PT · NL · PL
      "GKV", "AHV", "HMRC", "PAYE", "P60", "IRPF", "SEPE", "INPS", "ISEE",
      "ADSE", "UWV", "AOW", "ZUS", "PIT",
    ]) {
      expect(isGenericTerm(v), v).toBe(true);
    }
    // A legal form reads as a function word once its dots are stripped ("S.A" → "sa").
    expect(isStopword("S.A")).toBe(true);
  });

  it("covers the institutional vocabulary in the other languages too", () => {
    // Standalone common nouns…
    for (const v of [
      "Versicherung", "Krankenversicherung", "Finanzamt", "Arbeitslosengeld", // DE
      "insurance", "policyholder", "mortgage", // EN
      "seguro", "póliza", "jubilación", "hacienda", // ES
      "assicurazione", "polizza", "pensione", // IT
      "apólice", "aposentadoria", // PT
      "verzekering", "uitkering", // NL
      "ubezpieczenie", "emerytura", // PL
      "försäkring", "forsikring", "skat", // SV/DA/NO
      "pojištění", "důchod", // CS
      "保险", "年金", "보험", // CJK
    ]) {
      expect(isGenericTerm(v), v).toBe(true);
    }
    // …and the institutional PHRASES, via the compound gate + the function words.
    for (const v of [
      "Gesetzliche Krankenversicherung", // DE
      "Seguridad Social", // ES
      "Agencia Tributaria", // ES
      "Agenzia delle Entrate", // IT
      "Urząd Skarbowy", // PL
    ]) {
      expect(isGenericCompound(v), v).toBe(true);
    }
    // A NAMED institution is the notorious list's job, not the compound gate's.
    expect(isGenericCompound("Bundesagentur für Arbeit")).toBe(false);
    expect(isNotoriousEntity("Bundesagentur für Arbeit", "company")).toBe(true);
  });

  it("spares the major European senders — full unambiguous forms only", () => {
    for (const v of ["Banco Santander", "Intesa Sanpaolo", "Belastingdienst", "Nordea", "AOK"]) {
      expect(isNotoriousEntity(v, "company"), v).toBe(true);
    }
    // The bare CITY never rides along: a location stays personal data.
    expect(isNotoriousEntity("Santander", "location")).toBe(false);
    expect(isNotoriousEntity("Zurich", "location")).toBe(false);
  });

  it("spares the institutions that SENT the letter (company reading)", () => {
    for (const v of ["Pacifica", "PREDICA", "CAMCA", "France Travail", "Crédit Logement"]) {
      expect(isNotoriousEntity(v, "company"), v).toBe(true);
    }
  });

  it("a MULTI-WORD famous org mis-read as a NAME is spared too — a single word is not", () => {
    // The gazetteer pairs "France" (a first name) + "Travail" into a NAME candidate;
    // faked, it became "Lina Vernay" and its per-word aliases corrupted "code du
    // travail". No private person carries an institution's full name.
    expect(isNotoriousEntity("France Travail", "name")).toBe(true);
    expect(isNotoriousEntity("Banque Populaire", "name")).toBe(true);
    // The category scoping stays intact for SINGLE words: a person surnamed after a
    // brand keeps their protection.
    expect(isNotoriousEntity("Hermès", "name")).toBe(false);
    expect(isNotoriousEntity("Pacifica", "name")).toBe(false);
    expect(isNotoriousEntity("Tesla", "name")).toBe(false);
  });

  it("holds at the choke point, so every detector benefits", () => {
    expect(
      surviving([
        "garantie",
        "assurance maladie",
        "Registre des Intermédiaires en Assurance",
        "Siège social",
        "PACIFICA",
      ]),
    ).toEqual([]);
  });
});

describe("…and the real data in the same letter is still redacted", () => {
  it("keeps the private identities the document is actually about", () => {
    // The exact shapes that shared the page with the vocabulary above. If one of these
    // ever disappears, an added word is over-broad — that is the failure this pins.
    expect(surviving(["SABOURDIN JULIEN"], "name")).toEqual(["SABOURDIN JULIEN"]);
    expect(surviving(["Assurances Berlioz"], "company")).toEqual(["Assurances Berlioz"]);
    expect(surviving(["Cabinet Garantie & Fils"], "company")).toEqual([
      "Cabinet Garantie & Fils",
    ]);
    expect(surviving(["4 rue Louis Braille"], "address")).toEqual(["4 rue Louis Braille"]);
  });

  it("never lets a covered word swallow a name that merely contains one", () => {
    // Standalone-only is the whole safety of an allow-list: a person named "Lecourtier"
    // or a company "Prévoyance Rebour" shares a substring, not a value.
    expect(isGenericTerm("Lecourtier")).toBe(false);
    expect(isGenericCompound("Prévoyance Rebour")).toBe(false);
    expect(isGenericCompound("Assurances Marceau")).toBe(false);
    // An elided real name splits, but its distinctive token keeps the candidate.
    expect(isGenericCompound("d'Aubigné")).toBe(false);
  });
});

describe("vocabulaire PROTOCOLAIRE — un acronyme technique n'est jamais une entité", () => {
  // Observed on a real agentic turn: « MCP » was vaulted as sensitive data and
  // replaced by an invented three-letter token. The substitution applying to the WHOLE
  // conversation, every occurrence — including in tool results — was
  // rewritten. The generic filter is the choke point common to ALL sources
  // (rules, local NER, remote detector), so that's where it gets closed off.
  it("couvre les protocoles et formats que le trafic agentique charrie en continu", () => {
    // File EXTENSIONS (pdf, docx…) are deliberately NOT in it: the path
    // faker needs them as extensions, and listing them broke the same-kind fake.
    for (const v of ["MCP", "mcp", "SSE", "OAuth", "SQL", "LLM", "OCR",
                     "webhook", "gRPC", "WebSocket", "connecteur", "protocole"]) {
      expect(isGenericTerm(v), v).toBe(true);
    }
  });

  it("et le POINT DE PASSAGE les écarte, quelle que soit la source qui les a détectés", () => {
    // `filterCandidates` is crossed by the rules, the local NER AND the remote
    // detector: pinning it here, rather than just the vocabulary, pins the
    // actual behavior — the NER can't be loaded in a unit test.
    expect(surviving(["MCP", "SSE", "OAuth"], "company")).toEqual([]);
    expect(surviving(["MCP"], "sensitive")).toEqual([]);
    // A real entity in the SAME batch always passes: the filter drops, it doesn't cut across.
    expect(surviving(["MCP", "Karl Studio"], "company")).toEqual(["Karl Studio"]);
  });

  it("la discipline tient : un mot à double vie reste HORS de la liste", () => {
    // An entry here ships the word in clear forever: a 2-3 letter acronym
    // that reads like initials doesn't go in it, and an ordinary proper name even less so.
    for (const v of ["ui", "ner", "Morvan", "Paris", "Vallon"]) {
      expect(isGenericTerm(v), v).toBe(false);
    }
  });
});
