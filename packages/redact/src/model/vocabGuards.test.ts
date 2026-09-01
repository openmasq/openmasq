import { describe, it, expect } from "vitest";
import { isGenericTerm } from "./genericTerms";
import { VOCAB_TERMS, CLINICAL_TERMS } from "./vocab";
import { FIRST_NAMES } from "../engine/names/firstNames.data";
import { COMMON_SURNAMES } from "./surnamesGuard.data";

/**
 * The two invariants that bound the vocabulary volumes. Both are cheap; both close a
 * hole that was found by measurement rather than by reading.
 */
describe("vocabulary volumes — the invariants that bound an allow-list", () => {
  /**
   * ⚠️ REGRESSION. The lookup keeps accents (only delimiters are folded), so an entry
   * written bare-ASCII never matches the spelling a real French document uses. The
   * technical volume shipped with « observabilite », « vulnerabilite », « déploiement
   * continu » in ASCII only — 40+ entries that could not fire on any real text, and no
   * test noticed because the corpus measurement stubs a detector on the ENGLISH tooling
   * names. These are the spellings as they occur in the documents, all languages.
   */
  it("resolves the ACCENTED spelling, the one real text actually uses", () => {
    const asWritten = [
      // tech — the shipped defect
      "observabilité", "télémétrie", "vulnérabilité", "déploiement continu",
      "intégration continue", "requête sql", "modèle de langage", "spécification",
      "expression régulière", "hameçonnage", "rançongiciel", "bac à sable",
      // health
      "médecin", "échographie", "glycémie", "hémoglobine", "anesthésie",
      "tension artérielle", "rééducation", "prélèvement", "hôpital",
      // education
      "école", "lycée", "université", "baccalauréat", "relevé de notes",
      "thèse", "matière", "moyenne générale", "élève", "étudiant",
      // law
      "considérant", "référé", "délibéré", "préjudice", "créance", "nullité",
      "dommages et intérêts", "responsabilité",
      // accounting
      "comptabilité", "trésorerie", "rentabilité", "créances", "échéance",
      "résultat net", "chiffre d'affaires", "immobilisation",
      // professional life
      "réunion", "compte rendu", "séminaire", "fidélisation", "réclamation",
      "déplacement", "péage", "aéroport", "grève",
      // other languages
      "diagnóstico", "análisis", "matrícula", "responsabilità", "università",
      "prüfung", "überweisung", "gewährleistung", "avaliação", "orçamento",
    ];
    expect(asWritten.filter((t) => !isGenericTerm(t))).toEqual([]);
  });

  /**
   * The ABSENT roster, made mechanical. Every volume header names the words it
   * deliberately refuses because they are ALSO a first name or surname, spelled
   * identically — an allow-list entry ships that word in clear forever, so a careless
   * "obviously generic" addition is a permanent leak for everyone carrying that name.
   * A header comment drifts; this fails the build.
   *
   * It is also why the volumes are NOT closed under accent-folding: « campaña » is a
   * Spanish common noun, but its bare-ASCII twin « campana » is a surname. The ASCII
   * twin is added per entry, by hand, never generated.
   */
  it("keeps the deliberately-ABSENT homographs redactable", () => {
    const mustStayRedactable = [
      // professions/roles that are also surnames
      "richter", "doyen", "dean", "maire", "courtier", "corredor", "bachelier",
      "meunier", "berger", "marchand", "garant", "prevost", "chancelier",
      "meister", "maestro", "sergent", "bailly",
      // eponyms — these ARE people's names. The clinical volume adds molecules and
      // pathologies; every EPONYMOUS one stays out, and this roster is what holds the
      // line. They need a CONTEXTUAL gate ("maladie de X"), never a flat entry.
      "parkinson", "alzheimer", "crohn", "hodgkin", "pasteur", "curie", "vidal",
      "apgar", "glasgow", "charcot", "basedow", "ménière", "meniere", "dupuytren",
      "sjögren", "sjogren", "behçet", "behcet", "asperger", "cushing", "addison",
      "raynaud", "paget", "wilson", "tourette", "bichat", "broca", "babinski",
      // labs and brands — their place is `notorious.ts`, which is SCOPED by
      // category: sparing « Roche » there would also spare Jeanne Cayre's surname,
      // who is in the corpus.
      "roche", "servier", "bayer", "merck", "sanofi", "pfizer", "novartis", "biogaran",
      "doliprane", "spasfon", "levothyrox", "efferalgan",
      // form labels excluded on a real collision (cf. `vocab/formulaire.ts`)
      "moy", "signe", "colon", "rein", "iris",
      // REMOVED from the volumes by the mechanical guard below: each was an
      // "obviously generic" entry that spared a real first name or surname.
      // The accepted cost is a loss of coverage ("mark" on an English statement,
      // "malin" in the medical sense); the reverse cost would have been a name left in clear.
      "loan", "cassandra", "dora", "malin", "mark", "grant", "barreau", "asma", "ward",
      // tech words that double as given names/surnames. NOT here: `swift` — the banking
      // label list in `genericTermsData.ts` spares it as the SWIFT/BIC header, a call
      // made before this volume and on a stronger case (a bare "SWIFT:" line in a bank
      // letter). The tech volume still refuses it as a language name.
      "ruby", "rust", "django", "ada", "julia", "crystal", "pascal",
      "jenkins", "travis", "hudson", "sentry", "kafka", "tesla", "nova", "iris",
      "sierra", "phoenix",
      // accent-folded traps
      "campana", "ledger",
    ];
    const spared = mustStayRedactable.filter((t) => isGenericTerm(t));
    expect(spared, `ces mots doivent rester redactable : ${spared.join(", ")}`).toEqual([]);
  });

  /**
   * Rule 3: a 1-2 char LATIN entry collides with initials, and the match is on the WHOLE
   * value — so a real one-token name would be spared outright. Scoped to Latin script on
   * purpose: in CJK a 1-2 character token is a whole ordinary word (保险 = insurance,
   * 은행 = bank), and refusing those would empty the CJK side of the admin volume.
   *
   * The four survivors are ACRONYMS as they appear in real documents, each checked
   * against the name it could spare: `ht`/`ttc` (invoice tax lines), `ww` (Dutch
   * unemployment benefit), `ia`/`ml` (team names). `ai` was REMOVED when this test was
   * written — "Ai" is a common Japanese/Chinese given name and the product redacts CJK,
   * so sparing the team word cost that name in clear.
   */
  it("carries no bare 1-2 character LATIN entry outside the named acronyms", () => {
    const ACRONYMS = new Set(["ht", "ttc", "ww", "ia", "ml"]);
    const tooShort = VOCAB_TERMS.filter(
      (t) =>
        /^[\p{Script=Latin}\p{M}]+$/u.test(t.replace(/[.\s_'’-]/g, "")) &&
        t.replace(/[.\s_'’-]/g, "").length <= 2 &&
        !ACRONYMS.has(t),
    );
    expect(tooShort, `entrées trop courtes : ${tooShort.join(", ")}`).toEqual([]);
  });

  /**
   * The MECHANICAL guard against collisions — rule 2 of `vocab/index.ts` made
   * executable. A term must never be reachable as a real first name or surname.
   *
   * ⚠️ The comparison reproduces EXACTLY the scope of `isGenericTerm`: lowercase,
   * delimiters folded, **accents KEPT**. That's what makes rule 4 useful —
   * « marié » doesn't spare « Marie », and « signé » doesn't spare « Signe ». Folding
   * accents here would flag entries the engine can never confuse… and worse, it
   * would hide the one dangerous thing: the ASCII TWIN added by hand. That's the
   * trap the file documents (« campaña » / « campana »), and it's only visible with
   * accents kept.
   *
   * Surnames used to ALSO come from the bench corpora's `NAME` truths; those corpora
   * now live outside this repo (private benches), and that half of the harvest
   * runs there. What remains here is the CURATED list — the axis densest in traps as
   * soon as COMMON vocabulary is added: « poisson », « berger », « boulanger », « chevalier »
   * are names carried by real people. This list is TEST-ONLY — never read by the
   * engine.
   */
  it("n'est atteignable ni comme prénom ni comme patronyme réel", () => {
    const key = (x: string) => x.trim().toLowerCase().replace(/[.\s_'’-]+/g, "");
    const surnames = new Set<string>();
    for (const n of COMMON_SURNAMES) surnames.add(key(n));

    const collisions = [...VOCAB_TERMS, ...CLINICAL_TERMS].filter(
      (t) => FIRST_NAMES.has(key(t)) || surnames.has(key(t)),
    );
    expect(
      collisions,
      `ces termes épargneraient une personne réelle : ${collisions.join(", ")}`,
    ).toEqual([]);
  });
});
