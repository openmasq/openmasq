import { describe, it, expect } from "vitest";
import { isGenericTerm } from "./genericTerms";
import { VOCAB_TERMS, CLINIQUE_TERMS } from "./vocab";
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
      // santé
      "médecin", "échographie", "glycémie", "hémoglobine", "anesthésie",
      "tension artérielle", "rééducation", "prélèvement", "hôpital",
      // éducation
      "école", "lycée", "université", "baccalauréat", "relevé de notes",
      "thèse", "matière", "moyenne générale", "élève", "étudiant",
      // droit
      "considérant", "référé", "délibéré", "préjudice", "créance", "nullité",
      "dommages et intérêts", "responsabilité",
      // gestion
      "comptabilité", "trésorerie", "rentabilité", "créances", "échéance",
      "résultat net", "chiffre d'affaires", "immobilisation",
      // vie professionnelle
      "réunion", "compte rendu", "séminaire", "fidélisation", "réclamation",
      "déplacement", "péage", "aéroport", "grève",
      // autres langues
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
      // laboratoires et marques — leur place est `notorious.ts`, qui est SCOPÉ par
      // catégorie : y épargner « Roche » épargnerait aussi le patronyme de Jeanne Cayre,
      // qui est dans le corpus.
      "roche", "servier", "bayer", "merck", "sanofi", "pfizer", "novartis", "biogaran",
      "doliprane", "spasfon", "levothyrox", "efferalgan",
      // libellés de formulaire écartés sur collision réelle (cf. `vocab/formulaire.ts`)
      "moy", "signe", "colon", "rein", "iris",
      // RETIRÉS des volumes par le garde-fou mécanique ci-dessous : chacun était une
      // entrée « évidemment générique » qui épargnait un prénom ou un patronyme réel.
      // Le coût assumé est une perte de couverture (« mark » sur un relevé anglais,
      // « malin » au sens médical) ; le coût inverse aurait été un nom en clair.
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
   * Le garde-fou MÉCANIQUE des collisions — la règle 2 de `vocab/index.ts` rendue
   * exécutable. Un terme ne doit jamais être atteignable comme prénom ou patronyme réel.
   *
   * ⚠️ La comparaison reproduit EXACTEMENT la portée de `isGenericTerm` : minuscules,
   * délimiteurs repliés, **accents CONSERVÉS**. C'est ce qui rend la règle 4 utile —
   * « marié » n'épargne pas « Marie », et « signé » n'épargne pas « Signe ». Plier les
   * accents ici accuserait des entrées que le moteur ne peut pas confondre… et surtout
   * masquerait la seule chose dangereuse : le JUMEAU ASCII ajouté à la main. C'est le
   * piège que le dossier documente (« campaña » / « campana »), et il ne se voit qu'à
   * accents conservés.
   *
   * Les patronymes venaient AUSSI des vérités `NAME` des corpus de bancs ; ces corpus
   * vivent désormais hors de ce dépôt (bancs privés), et cette moitié de la moisson
   * tourne là-bas. Ici reste la liste CURÉE — l'axe le plus dense en pièges dès qu'on
   * ajoute du vocabulaire COURANT : « poisson », « berger », « boulanger », « chevalier »
   * sont des noms portés par des gens réels. La liste est de TEST — jamais lue par le
   * moteur.
   */
  it("n'est atteignable ni comme prénom ni comme patronyme réel", () => {
    const key = (x: string) => x.trim().toLowerCase().replace(/[.\s_'’-]+/g, "");
    const surnames = new Set<string>();
    for (const n of COMMON_SURNAMES) surnames.add(key(n));

    const collisions = [...VOCAB_TERMS, ...CLINIQUE_TERMS].filter(
      (t) => FIRST_NAMES.has(key(t)) || surnames.has(key(t)),
    );
    expect(
      collisions,
      `ces termes épargneraient une personne réelle : ${collisions.join(", ")}`,
    ).toEqual([]);
  });
});
