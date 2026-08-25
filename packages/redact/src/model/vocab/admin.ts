/**
 * GENERIC_TERMS, second volume: the **institutional common vocabulary** — insurance,
 * banking/credit, social protection, taxation and public administration — in the
 * languages the product covers. Folded into `GENERIC_TERMS` by `genericTermsData.ts`
 * (one flat Set, so a lookup stays O(1) and adding a language costs nothing).
 *
 * Why a whole volume of its own: an administrative letter is DENSE with these words, and
 * a NER tags them PERSON/ORG/LOC by the dozen — one real report had 81 "redactions" of
 * which most were « garantie », « assurance maladie », « Registre des Intermédiaires en
 * Assurance », « Siège social », « foyer fiscal », « DPE ». Each one is then replaced by
 * an invented company/name, so the model reads a letter about nobody. None of these words
 * is EVER an identity on its own.
 *
 * ⚠️ Same allow-list discipline as the rest (a wrong entry ships that word in clear
 * FOREVER), and it is what bounds this list:
 * - a common NOUN or ADJECTIVE only — never a brand, never a proper noun (a specific
 *   insurer belongs in `notorious.ts`, which is category-scoped);
 * - never a word that doubles as a first name or surname (so: no "berger", no "meunier",
 *   no "marchand", no "garant", no "corredor", no "prima");
 * - the drop is STANDALONE-only — a span that merely CONTAINS one of these ("Assurance
 *   Berlioz") is untouched, and a multi-word span is dropped only when EVERY word is
 *   covered (`isGenericCompound`), which is what makes « de courtage d'assurances » and
 *   « Caisse régionale de Crédit Agricole Mutuel » fall out without listing them.
 */
export const ADMIN_TERMS: string[] = [
  // ── Insurance — French ─────────────────────────────────────────────────────
  // The reported flood. "assuré"/"assurée" are the ROLE, never the person's name.
  "assurance", "assurances", "assureur", "assureurs",
  "assuré", "assure", "assurée", "assurees", "assurés", "assures",
  "réassurance", "reassurance", "coassurance", "multirisque", "multirisques",
  // « courtier(s)/courtière » RETIRÉS : patronymes, comme « corredor » que ce volume
  // excluait déjà. « courtage » est l'activité, jamais un nom.
  "courtage",
  "police", "polices", "garantie", "garanties",
  "sinistre", "sinistres", "prime", "primes", "franchise", "franchises",
  "indemnité", "indemnite", "indemnités", "indemnites", "indemnisation",
  "prévoyance", "prevoyance", "souscripteur", "souscripteurs", "souscription",
  "souscriptions", "adhérent", "adherent", "adhérents", "adherents", "adhésion",
  "adhesion", "sociétaire", "sociétaires", "cotisant", "cotisants",
  "emprunteur", "emprunteurs", "emprunt", "emprunts", "prêt", "pret", "prêts",
  "prets", "capital", "capitaux", "rente viagère", "viager", "viagère",
  "quotité", "quotite", "quotités", "quotites", "aléa", "alea",
  // Contract OFFER/OPTION common nouns — the tier/option labels of an insurance or
  // telecom contract ("option BOOSTER", "formule Confort"): the KIND word alone is
  // never an identity (a label paired with a distinctive word keeps the candidate).
  "option", "options", "formule", "formules", "offre", "offres", "tarif", "tarifs",
  "forfait", "forfaits", "booster", "décès", "deces", "obsèques", "obseques",
  "rachat", "rachats", "exclusion", "exclusions", "plafonds", "barème", "bareme",
  // ── Insurance / finance — other languages ──────────────────────────────────
  "insurance", "insurer", "insured", "policyholder", "underwriter", "broker",
  "brokerage", "coverage", "premium", "deductible", "claim", "claims", "warranty",
  "guarantee", "guarantor", "annuity", "borrower", "lender", "mortgage",
  "versicherung", "versicherungen", "versicherer", "versicherte", "versicherungsnehmer",
  "vermittler", "makler", "bürgschaft", "buergschaft", "garantie",
  "schaden", "schadensfall", "beitrag", "beiträge", "beitraege", "selbstbeteiligung",
  "darlehen", "kredit", "hypothek", "kreditnehmer",
  "seguro", "seguros", "asegurado", "asegurador", "aseguradora",
  "correduría", "correduria", "póliza", "poliza", "pólizas", "polizas",
  "garantía", "garantia", "garantías", "garantias", "siniestro", "siniestros",
  "franquicia", "indemnización", "indemnizacion", "préstamo", "prestamo", "hipoteca",
  "assicurazione", "assicurazioni", "assicuratore", "assicurato", "polizza", "polizze",
  "garanzia", "garanzie", "sinistro", "sinistri", "franchigia", "indennizzo",
  "prestito", "prestiti", "mutuo", "mutui", "intermediario", "intermediari",
  "seguro de vida", "segurado", "seguradora", "corretor", "corretora", "apólice",
  "apolice", "apólices", "sinistros", "indemnização", "indemnizacao", "indenização",
  "indenizacao", "empréstimo", "emprestimo", "financiamento",
  "verzekering", "verzekeringen", "verzekeraar", "verzekerde", "makelaar", "polis",
  "polissen", "waarborg", "schadegeval", "eigen risico", "lening", "hypotheek",
  "ubezpieczenie", "ubezpieczenia", "ubezpieczyciel", "ubezpieczony", "polisa",
  "gwarancja", "składka", "skladka", "szkoda", "pożyczka", "pozyczka", "kredyt",
  // ── Banking / accounts — multilingual ──────────────────────────────────────
  // The KIND word only; the account NUMBER is a structured rule's job.
  "banque", "banques", "bancaire", "bancaires", "caisse", "caisses", "agence bancaire",
  "épargne", "epargne", "livret", "livrets", "découvert", "decouvert",
  "versement", "versements", "prélèvement automatique", "domiciliation",
  "mensualité", "mensualite", "mensualités", "mensualites", "annuité", "annuite",
  "annuités", "annuites", "amortissement", "amortissements", "échéancier",
  "echeancier", "capital restant dû", "capital restant du", "taux effectif global",
  "bank", "banking", "savings", "deposit", "withdrawal", "instalment", "installment",
  "statement of account", "outstanding balance",
  "sparkasse", "sparbuch", "konto", "kontostand", "überweisung", "ueberweisung",
  "lastschrift", "rate", "raten", "tilgung",
  "banco", "bancaria", "bancario", "ahorro", "ahorros", "cuenta bancaria", "ingreso",
  "domiciliación", "domiciliacion", "cuota", "cuotas", "amortización", "amortizacion",
  "banca", "bancaria", "risparmio", "conto corrente", "bonifico", "rata", "rate",
  "ammortamento", "poupança", "poupanca", "conta bancária", "conta bancaria",
  "transferência", "transferencia", "prestação", "prestacao", "amortização",
  "amortizacao", "spaarrekening", "bankrekening", "overschrijving", "aflossing",
  "oszczędności", "oszczednosci", "rachunek bankowy", "przelew", "rata",
  // ── Social protection / health — French ────────────────────────────────────
  "maladie", "maladies", "santé", "sante", "invalidité", "invalidite",
  "incapacité", "incapacite", "incapacité temporaire", "incapacité permanente",
  "hospitalisation", "hospitalisations", "accident", "accidents", "arrêt de travail",
  "arret de travail", "affection", "affections", "affection longue durée",
  "handicap", "handicaps", "handicapé", "handicape", "handicapée", "handicapee",
  "handicapés", "handicapes", "handicapées", "handicapees",
  "autonomie", "dépendance", "dependance", "retraite", "retraites", "pension",
  "pensions", "allocation", "allocations", "prestation", "prestations",
  "sécurité sociale", "securite sociale", "protection sociale", "régime", "regime",
  "régimes", "regimes", "mutualité", "mutualite", "complémentaire", "complementaire",
  "complémentaire santé", "tiers payant", "remboursements", "franchise médicale",
  // ── Social protection / health — other languages ───────────────────────────
  "health", "sickness", "illness", "disability", "disabled", "invalidity",
  "incapacity", "hospitalisation", "hospitalization", "retirement", "pension",
  "benefit", "benefits", "allowance", "social security", "welfare",
  "gesundheit", "krankheit", "krankenkasse", "invalidität", "invaliditaet",
  "arbeitsunfähigkeit", "arbeitsunfaehigkeit", "behinderung", "rente", "renten",
  "ruhestand", "sozialversicherung", "leistung", "leistungen",
  "salud", "enfermedad", "invalidez", "incapacidad", "discapacidad", "jubilación",
  "jubilacion", "pensión", "pension", "prestación", "prestacion", "subsidio",
  "seguridad", "seguridad social", "salute", "malattia", "invalidità", "invalidita", "inabilità",
  "inabilita", "disabilità", "disabilita", "pensione", "previdenza", "prestazione",
  "saúde", "saude", "doença", "doenca", "invalidez", "incapacidade", "deficiência",
  "deficiencia", "aposentadoria", "reforma", "previdência", "previdencia",
  "gezondheid", "ziekte", "arbeidsongeschiktheid", "invaliditeit", "handicap",
  "pensioen", "uitkering", "sociale zekerheid",
  "zdrowie", "choroba", "niezdolność", "niezdolnosc", "niepełnosprawność",
  "niepelnosprawnosc", "emerytura", "renta", "świadczenie", "swiadczenie",
  // ── Tax / income — multilingual ────────────────────────────────────────────
  "fiscal", "fiscale", "fiscaux", "fiscales", "fiscalité", "fiscalite",
  "foyer", "foyers", "foyer fiscal", "impôt", "impot", "impôts", "impots",
  "imposition", "imposable", "revenu", "revenus", "ressources", "abattement",
  "déduction", "deduction", "déductions", "deductions", "exonération", "exoneration",
  "tax", "taxes", "taxable", "taxation", "income", "household", "rebate", "levy",
  "steuer", "steuern", "steuerlich", "einkommen", "haushalt", "freibetrag",
  "impuesto", "impuestos", "fiscalidad", "renta", "ingresos", "deducción", "deduccion",
  "imposta", "imposte", "fiscale", "reddito", "redditi", "detrazione",
  "imposto", "impostos", "rendimento", "rendimentos", "dedução", "deducao",
  "belasting", "belastingen", "inkomen", "huishouden", "aftrek",
  "podatek", "podatki", "dochód", "dochod", "gospodarstwo domowe", "ulga",
  // ── Royalties / répartition — French ───────────────────────────────────────
  // The FAMILY labels of a rights-society statement (Sacem « FAMILLES » column):
  // « Etranger » standing alone in the grid was NER-tagged an ORG and faked to an
  // invented company. A distribution-category word is never anyone's identity.
  "étranger", "etranger", "répartition", "repartition", "répartitions", "repartitions",
  // ── Public administration / bodies — French ────────────────────────────────
  // The KIND of body, never a specific named organisation.
  "registre", "registres", "immatriculation", "immatriculations",
  "intermédiaire", "intermediaire", "intermédiaires", "intermediaires",
  "commission", "commissions", "conseil", "conseils", "comité", "comite", "comités",
  "comites", "autorité", "autorite", "autorités", "autorites", "organisme",
  "organismes", "administration", "administrations", "administratif", "administrative",
  "ministère", "ministere", "ministères", "ministeres", "préfecture", "prefecture",
  "sous-préfecture", "sous-prefecture", "mairie", "mairies", "commune", "communes",
  "département", "departement", "départements", "departements", "région", "regions",
  "tribunal", "tribunaux", "juridiction", "juridictions", "instance", "instances",
  "délégation", "delegation", "délégué", "delegue", "déléguée", "deleguee",
  "médiateur", "mediateur", "médiation", "mediation", "recours", "réclamation",
  "reclamation", "réclamations", "reclamations", "litige", "litiges",
  "droit", "droits", "devoir", "devoirs", "obligation", "obligations",
  "personne", "personnes", "particulier", "particuliers", "usager", "usagers",
  "citoyen", "citoyens", "bénéficiaire du droit", "dispositif", "dispositifs",
  "siège", "siege", "siège social", "siege social", "établissement principal",
  "succursale", "succursales", "filiale", "filiales", "groupe", "groupes",
  // ── Public administration / bodies — other languages ───────────────────────
  "register", "registry", "registration", "intermediary", "intermediaries",
  "commission", "committee", "council", "board", "authority", "authorities",
  "agency", "agencies", "body", "ministry", "department", "municipality",
  "court", "tribunal", "ombudsman", "appeal", "complaint", "dispute",
  "right", "rights", "duty", "obligation", "person", "persons", "people",
  "headquarters", "registered office", "branch", "subsidiary",
  "register", "registrierung", "vermittlerregister", "kommission", "ausschuss",
  "beirat", "behörde", "behoerde", "amt", "ämter", "aemter", "ministerium",
  "gemeinde", "bezirk", "gericht", "beschwerde", "einspruch", "streitigkeit",
  "recht", "rechte", "pflicht", "person", "personen", "sitz", "hauptsitz",
  "niederlassung", "tochtergesellschaft",
  "registro", "inscripción", "inscripcion", "intermediario", "intermediarios",
  "comisión", "comision", "comité", "comite", "consejo", "autoridad", "autoridades",
  "organismo", "administración", "administracion", "ministerio", "ayuntamiento",
  "municipio", "juzgado", "reclamación", "reclamacion", "litigio", "derecho",
  "derechos", "persona", "personas", "sede", "sede social", "sucursal", "filial",
  "registro", "iscrizione", "commissione", "comitato", "consiglio", "autorità",
  "autorita", "ente", "enti", "amministrazione", "ministero", "comune", "provincia",
  "tribunale", "reclamo", "controversia", "diritto", "diritti", "persona", "persone",
  "sede legale", "filiale", "succursale",
  "registo", "inscrição", "inscricao", "intermediário", "intermediario", "comissão",
  "comissao", "conselho", "autoridade", "organismo", "administração", "administracao",
  "ministério", "ministerio", "município", "municipio", "câmara", "camara",
  "reclamação", "reclamacao", "litígio", "litigio", "direito", "direitos", "pessoa",
  "pessoas", "sede social", "sucursal", "filial",
  "register", "inschrijving", "commissie", "raad", "bestuur", "autoriteit", "instantie",
  "administratie", "ministerie", "gemeente", "rechtbank", "klacht", "geschil",
  "recht", "rechten", "plicht", "persoon", "personen", "hoofdkantoor", "vestiging",
  "rejestr", "rejestracja", "komisja", "rada", "organ", "urząd", "urzad",
  "ministerstwo", "gmina", "sąd", "sad", "skarga", "spór", "spor", "prawo", "prawa",
  "osoba", "osoby", "siedziba", "oddział", "oddzial",
  // ── Qualifying adjectives that make an institution's name (never an identity) ──
  // With these covered, `isGenericCompound` drops the whole title: « Caisse régionale
  // de Crédit Agricole Mutuel », « Caisse primaire », « Commission des Droits et de
  // l'Autonomie des Personnes Handicapées », « Registre des Intermédiaires ».
  "régional", "regional", "régionale", "regionale", "régionaux", "regionaux",
  "régionales", "regionales", "national", "nationale", "nationaux", "nationales",
  "départemental", "departemental", "départementale", "departementale",
  "communal", "communale", "municipal", "municipale", "local", "locale", "locaux",
  "général", "general", "générale", "generale", "généraux", "generaux", "générales",
  "generales", "primaire", "primaires", "secondaire", "secondaires",
  "public", "publique", "publics", "publiques", "privé", "prive", "privée", "privee",
  "mutuel", "mutuelle", "mutuels", "mutuelles", "agricole", "agricoles",
  "postal", "postale", "postaux", "postales", "populaire", "populaires",
  "social", "sociale", "sociaux", "sociales", "solidaire", "solidaires",
  "professionnel", "professionnelle", "professionnels", "professionnelles",
  "obligatoire", "obligatoires", "facultatif", "facultative", "collectif",
  "collective", "individuel", "individuelle", "temporaire", "permanent", "permanente",
  "annuel", "annuelle", "mensuel", "mensuelle", "trimestriel", "trimestrielle",
  "anonyme", "anonymes", "libéré", "libere", "libérée", "liberee", "libérés", "liberes",
  "distance", "à distance", "a distance", "espace", "espaces", "logement", "logements",
  "habitation", "habitations", "état", "etat", "états", "etats", "statut civil",
  "nationale", "européen", "europeen", "européenne", "europeenne",
  "regionale", "nazionale", "comunale", "generale", "pubblico", "privato",
  "regional", "nacional", "municipal", "geral", "público", "publico", "privado",
  "regionaal", "nationaal", "gemeentelijk", "algemeen", "openbaar", "privé",
  "regionalny", "krajowy", "gminny", "ogólny", "ogolny", "publiczny", "prywatny",
  "skarbowy", "gesetzlich", "gesetzliche", "gesetzlichen", "staatlich", "staatliche",
  "öffentlich", "oeffentlich", "öffentliche", "oeffentliche", "estatal",
  "autonómico", "autonomico", "autonómica", "autonomica", "tributaria", "tributario",
  "statale", "statali", "erariale",
  // Glued German institution nouns (the language compounds where French phrases):
  // "Gesetzliche Krankenversicherung" is adjective + ONE glued noun, so the noun
  // needs its own entry for the compound gate to see it covered.
  "krankenversicherung", "rentenversicherung", "pflegeversicherung",
  "unfallversicherung", "arbeitslosenversicherung", "haftpflichtversicherung",
  "lebensversicherung", "berufsunfähigkeitsversicherung", "finanzamt", "finanzämter",
  "jobcenter", "arbeitsagentur", "krankengeld", "arbeitslosengeld", "kindergeld",
  "wohngeld", "elterngeld", "bürgergeld", "buergergeld",
  // Spanish / Italian treasury common nouns ("Agencia Tributaria", "Agenzia delle
  // Entrate" — with these covered the compound gate drops the whole title).
  "hacienda", "agencia", "agencias", "agenzia", "agenzie", "entrate",
  // ── Administrative ACRONYMS, per country ───────────────────────────────────
  // Scheme / body / tax-form acronyms: a KIND, never an identity. Curated to the
  // unambiguous ones — anything readable as a person's initials or a name is left
  // out ("ISA" the account = "Isa" the first name; "TARI" the tax = a rare name).
  // France
  "aeras", "cdaph", "mdph", "ficp", "fcc", "ptia", "itt", "ipt", "iptt", "ald",
  "ijss", "aah", "apl", "pch", "cmu", "css", "csg", "crds", "dpe", "ges", "ade",
  "cnav", "cnaf", "cpam", "carsat", "agirc", "arrco", "agirc-arrco",
  "ircantec", "msa", "cnp", "orias", "acpr", "amf", "dgfip", "dgccrf", "cnil",
  "rgpd", "gdpr", "dsn", "dpae", "smic", "pass", "pmss", "tmi", "teg", "taeg",
  "shon", "shob", "ernmt", "errial", "dtg",
  // Germany / Austria / Switzerland
  "gkv", "pkv", "alg", "sgb", "bafög", "bafog", "ahv", "suva", "bvg", "uid",
  // United Kingdom / Ireland
  "hmrc", "nhs", "dwp", "paye", "p45", "p60", "apr", "aer", "dbs",
  // Spain
  "irpf", "tgss", "inss", "sepe",
  // Italy
  "inps", "inail", "isee", "imu", "irpef", "spid", "cud",
  // Portugal
  "irs", "irc", "imi", "adse",
  // Netherlands / Belgium
  "uwv", "svb", "aow", "ww", "wia", "woz", "bsn",
  // Poland
  "zus", "nfz", "pit", "cit", "krs",
  // Identity-document LABELS the main list lacked (the label, never the value).
  "nif", "dni", "nie",
  // ── Institutional common nouns — Nordic (SV/DA/NO share most of them) ──────
  "försäkring", "forsakring", "forsikring", "försäkringar", "forsikringer",
  "skatt", "skat", "skatter", "avtal", "avtale", "aftale", "kontrakt",
  "myndighet", "myndigheter", "myndighed", "kommun", "kommune", "kommuner",
  "bidrag", "lån", "pensjon", "sjukförsäkring", "sygeforsikring", "erstatning",
  "ersättning", "ersattning", "opsigelse", "uppsägning", "uppsagning",
  // ── Institutional common nouns — Czech / Slovak ────────────────────────────
  // The accent-LESS forms of "daň"/"daně" are OMITTED: "Dan"/"Dane" are first names
  // (the allow-list discipline; `orgAffixes.test.ts` pins "Dane" stays redactable).
  "pojištění", "pojisteni", "pojistka", "pojišťovna", "pojistovna", "smlouva",
  "daň", "daně", "důchod", "duchod", "úřad", "urad", "banka",
  "splátka", "splatka", "úvěr", "uver", "půjčka", "pujcka", "žádost", "zadost",
  // ── Institutional common nouns — CJK ───────────────────────────────────────
  // Chinese (中文): insurance / bank / pension / tax / social security / policy
  "保险", "保險", "银行", "銀行", "养老金", "養老金", "税", "稅", "税务", "稅務",
  "社保", "社会保险", "公积金", "保单", "保費", "保费", "理赔", "贷款", "貸款",
  // Japanese (日本語)
  "保険", "銀行", "年金", "税金", "保険料", "保険金", "融資", "住宅ローン",
  "健康保険", "厚生年金", "雇用保険", "労災保険", "介護保険",
  // Korean (한국어)
  "보험", "은행", "연금", "세금", "보험료", "보험금", "대출", "건강보험",
  "국민연금", "고용보험", "산재보험",
];
