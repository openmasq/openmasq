/**
 * GENERIC_TERMS, third volume: the **everyday-institution vocabulary** — employment /
 * payroll, housing & leases, health, education, courts & company registry, banking &
 * invoices, and public administration — in the languages the product covers
 * (FR-first, then EN/DE/ES/IT/PT like the admin volume). Folded into `GENERIC_TERMS`
 * by `genericTermsData.ts` (one flat Set, O(1) lookups).
 *
 * Why it exists: a payslip, a lease, a school certificate or a court extract is DENSE
 * with these role/domain words, and the NER tags them PERSON/ORG/LOC by the dozen. An
 * audit measured 123/193 of the most common ones UNCOVERED — each one then faked to an
 * invented name/company, so the model read a document about nobody.
 *
 * ⚠️ Same allow-list discipline as the other volumes (a wrong entry ships that word in
 * clear FOREVER):
 * - common nouns/adjectives and KIND-of-body acronyms only (CPAM-style: "CROUS",
 *   "URSSAF" read as a kind of office) — a specific institution's proper NAME
 *   ("Infogreffe") belongs in `notorious.ts`, category-scoped;
 * - never a word that doubles as a first name or surname — deliberately ABSENT:
 *   "garant" (like "berger"/"meunier"/"marchand" before it), "chancelier", "prevost";
 * - standalone-only semantics: a span that merely CONTAINS one of these ("Cabinet
 *   Rebour") is untouched, and a multi-word span falls out only when EVERY word is
 *   covered (`isGenericCompound`) — which is how "tribunal de commerce", "état des
 *   lieux" or "convention collective" fall out of their function words + these entries.
 */
/**
 * A statement's operation CODES — their OWN list because two places need them
 * (rule 9): here, so that a code alone is never an entity; and the span trimming
 * (`../pseudonymize/spanEdges.ts`), so that a code STUCK in front of a name falls out of
 * the span. Without the second, « VIR Rebour » was ONE entity — the provider received two
 * fakes (one for « VIR Rebour », one for « REBOUR ») and the operation type disappeared.
 */
export const BANK_OP_CODES = ["vir", "prlv", "reçu", "recu", "chq", "vrst", "remise"] as const;

export const VIE_TERMS: string[] = [
  // ── Employment & support — French ─────────────────────────────────────────
  // « emploi » was missing, and it is THE word of a Pôle emploi letter: faked, the whole
  // document talks about an invented trade. « rendez » too — « rendez-vous » was
  // covered, its half was not, hence « tout troyes-vous fixé ».
  "emploi", "emplois", "rendez", "conseiller", "conseillère", "conseillere",
  "référent", "referent", "actualisation", "actualiser", "accompagnement",
  "demandeur d'emploi", "demandeurs d'emploi", "offre d'emploi", "offres d'emploi",
  "recherche d'emploi", "espace personnel", "allocation", "allocations",
  "indemnités", "indemnites", "cessation d'inscription", "mission locale",
  "cap emploi", "agence pour l'emploi", "service public de l'emploi",

  // ── Elective and State public offices — French ────────────────────────────
  // A FUNCTION is never an identity. « maire » is deliberately ABSENT:
  // it is also a French surname, like « prevost » below — the function loses.
  "ministre", "ministres", "secrétaire d'état", "secretaire d'etat", "préfet",
  "prefet", "préfète", "prefete", "sous-préfet", "sous-prefet", "député",
  "depute", "députée", "deputee", "sénateur", "senateur", "sénatrice",
  "senatrice", "conseiller municipal", "conseillère municipale",
  "conseillere municipale", "conseiller départemental", "adjoint au maire",
  "élu", "elu", "élue", "elue", "élus", "elus", "mandat électif", "commune",

  // ── Employment / HR / payroll — French ────────────────────────────────────
  "employeur", "employeurs", "salarié", "salarie", "salariée", "salariee",
  "salariés", "salaries", "apprenti", "apprentie", "apprentis", "stagiaire",
  "stagiaires", "intérimaire", "interimaire", "intérimaires", "interimaires",
  "cadre", "cadres", "non-cadre", "non-cadres", "embauche", "recrutement",
  "convention collective", "contrat de travail", "cdi", "cdd", "essai",
  "période d'essai", "periode d'essai", "préavis", "preavis", "licenciement",
  "licenciements", "démission", "demission", "rupture conventionnelle",
  "ancienneté", "anciennete", "échelon", "echelon", "coefficient", "indice",
  "tranche", "tranches",
  "imposable", "payer", "net imposable", "net à payer", "net a payer",
  "heures supplémentaires", "heures supplementaires", "congés", "conges",
  "congés payés", "conges payes", "rtt", "absences", "primes d'ancienneté",
  "treizième mois", "treizieme mois", "tickets restaurant", "titres-restaurant",
  "dsn", "attestation employeur", "solde de tout compte", "bulletin de paie",
  "fiche de paie", "paie", "paye", "rémunérations", "remunerations",
  // ── Emploi — EN / DE / ES / IT / PT ───────────────────────────────────────
  "employer", "employee", "employees", "payroll", "payslip", "wage", "wages",
  "seniority", "notice period", "dismissal", "resignation", "severance",
  "overtime", "annual leave", "sick leave", "probation",
  "arbeitgeber", "arbeitnehmer", "gehalt", "lohn", "lohnabrechnung",
  "gehaltsabrechnung", "kündigung", "kuendigung", "abfindung", "urlaub",
  "probezeit", "betriebsrat", "tarifvertrag", "überstunden", "ueberstunden",
  "empleador", "empleado", "empleada", "nómina", "nomina", "salario",
  "despido", "renuncia", "indemnización por despido", "vacaciones", "antigüedad",
  "antiguedad", "finiquito", "convenio colectivo",
  "datore di lavoro", "dipendente", "dipendenti", "busta paga", "stipendio",
  "licenziamento", "dimissioni", "ferie", "anzianità", "anzianita",
  "straordinari", "contratto collettivo",
  "empregador", "empregado", "empregada", "folha de pagamento", "holerite",
  "salário", "demissão", "demissao", "rescisão", "rescisao", "férias", "ferias",
  "aviso prévio", "aviso previo", "décimo terceiro", "decimo terceiro",
  // ── Property / lease — French ─────────────────────────────────────────────
  "bailleur", "bailleurs", "preneur", "preneurs", "colocataire", "colocataires",
  "caution", "cautions", "cautionnement", "dépôt de garantie", "depot de garantie",
  "loyer", "loyers", "charges", "charges locatives", "provision", "provisions",
  "régularisation", "regularisation", "état des lieux", "bail commercial", "bail d'habitation", "etat des lieux",
  "diagnostic", "diagnostics", "surface", "surface habitable", "superficie",
  "lot", "lots", "tantième", "tantieme", "appel de fonds", "appels de fonds",
  "taxe foncière", "taxe fonciere", "taxe d'habitation", "préavis de départ",
  "acte authentique", "promesse de vente", "sous-location", "meublé", "meuble",
  "quittance de loyer", "révision", "revision", "indexation",
  // ── Immobilier — EN / DE / ES / IT / PT ───────────────────────────────────
  "landlord", "tenant", "tenants", "lease", "deposit", "security deposit",
  "rent", "utilities", "inventory", "sublet", "furnished",
  "vermieter", "mieter", "mieterin", "miete", "kaltmiete", "warmmiete",
  "nebenkosten", "kaution", "mietvertrag", "übergabeprotokoll", "uebergabeprotokoll",
  "arrendador", "arrendatario", "inquilino", "inquilina", "alquiler", "fianza",
  "arras", "comunidad de propietarios", "suministros",
  "locatore", "locatario", "conduttore", "affitto", "canone", "cauzione",
  "condominio", "spese condominiali",
  "locador", "locatário", "locatario", "inquilino", "aluguel", "aluguer",
  "caução", "caucao", "condomínio", "condominio",
  // ── Health — French ───────────────────────────────────────────────────────
  "médecin", "medecin", "médecins", "medecins", "médecin traitant",
  "medecin traitant", "spécialiste", "specialiste", "praticien", "praticienne",
  "infirmier", "infirmière", "infirmiere", "pharmacien", "pharmacienne",
  "patient", "patiente", "patients", "patientes", "assuré social", "ayant droit",
  "ayants droit", "ordonnance", "ordonnances", "prescription", "posologie",
  "consultation", "consultations", "hospitalisation", "séjour", "sejour",
  "service", "services", "urgences", "mutuelle", "mutuelles", "tiers payant",
  "feuille de soins", "carte vitale", "ald", "arrêt de travail", "arret de travail",
  "invalidité", "invalidite", "incapacité", "incapacite", "remboursement",
  "dépassement d'honoraires", "depassement d'honoraires", "parcours de soins",
  // ── Health — EN / DE / ES / IT / PT ───────────────────────────────────────
  "physician", "doctor", "practitioner", "nurse", "prescription", "dosage",
  "outpatient", "inpatient", "copay", "referral",
  "arzt", "ärztin", "aerztin", "hausarzt", "facharzt", "patientin", "rezept",
  "krankschreibung", "überweisung", "ueberweisung", "krankenkasse", "zuzahlung",
  "médico", "medico", "médica", "enfermero", "enfermera", "paciente", "receta",
  "consulta", "baja", "mutua", "copago",
  "medico di base", "paziente", "ricetta", "ticket", "visita", "ricovero",
  "médico de família", "medico de familia", "utente", "receita médica",
  "receita medica", "consulta médica", "baixa médica", "baixa medica",
  // ── School / training — French ────────────────────────────────────────────
  "élève", "eleve", "élèves", "eleves", "étudiant", "etudiant", "étudiante",
  "etudiante", "étudiants", "etudiants", "enseignant", "enseignante",
  "enseignants", "professeur", "professeure", "professeurs", "directeur",
  "directrice", "proviseur", "principal", "principale",
  "établissement scolaire", "etablissement scolaire", "académie", "academie",
  "rectorat", "classe", "classes", "niveau", "niveaux", "filière", "filiere",
  "diplôme", "diplome", "mention", "mentions", "bulletin scolaire", "semestre",
  "trimestre", "inscription", "réinscription", "reinscription", "scolarité",
  "scolarite", "bourse", "bourses", "boursier", "boursière", "boursiere",
  "crous", "cantine", "internat", "redoublement", "orientation",
  // ── School — EN / DE / ES / IT / PT ───────────────────────────────────────
  "pupil", "student", "students", "teacher", "headteacher", "tuition",
  "enrollment", "enrolment", "transcript", "scholarship", "grade", "semester",
  "schüler", "schuelerin", "schülerin", "lehrer", "lehrerin", "zeugnis",
  "einschreibung", "studiengang", "stipendium", "notenspiegel",
  "alumno", "alumna", "estudiante", "profesor", "profesora", "matrícula",
  "matricula", "expediente", "beca", "curso escolar",
  "alunno", "alunna", "studente", "studentessa", "insegnante", "pagella",
  "iscrizione", "borsa di studio",
  "aluno", "aluna", "professor titular", "boletim", "matrícula escolar",
  "bolsa de estudos", "propina", "propinas",
  // ── Registry / company register — French ──────────────────────────────────
  "greffe", "greffes", "greffier", "greffière", "greffiere", "tribunal",
  "tribunaux", "commerce", "instance", "juridiction", "audience",
  "inpi", "bodacc", "comptes annuels", "dépôt des comptes", "depot des comptes",
  // Single-word forms too — the COMPOUND splitter tests word by word, so a phrase
  // like « dépôt des comptes annuels » only falls out if each word is covered.
  "dépôt", "depot", "dépôts", "depots", "annuel", "annuels", "annuelle", "annuelles",
  "exercice", "exercices", "exercice social", "bilan", "bilans",
  "compte de résultat", "compte de resultat", "annexe", "annexes", "liasse",
  "liasse fiscale", "commissaire aux comptes", "expert-comptable",
  "experts-comptables", "comptable", "comptables", "capital social",
  "parts sociales", "cogérant", "cogerant", "cogérante", "immatriculation",
  "radiation", "dissolution", "liquidation", "cession", "cessions", "apport",
  "apports", "fusion", "fusions", "scission", "confidentialité", "confidentialite",
  "déclaration de confidentialité", "declaration de confidentialite",
  // ── Registre — EN / DE / ES / IT / PT ─────────────────────────────────────
  "registry", "registrar", "annual accounts", "filing", "auditor", "accountant",
  "share capital", "incorporation", "winding up", "merger",
  "handelsregister", "registergericht", "jahresabschluss", "bilanz",
  "wirtschaftsprüfer", "wirtschaftspruefer", "steuerberater", "stammkapital",
  "registro mercantil", "cuentas anuales", "auditor de cuentas", "contable",
  "capital social", "escritura", "disolución", "disolucion",
  "registro delle imprese", "bilancio", "revisore", "commercialista",
  "capitale sociale", "scioglimento",
  "registo comercial", "registro comercial", "contas anuais", "revisor oficial",
  "contabilista", "capital social", "dissolução", "dissolucao",
  // ── Banking / invoicing — French ──────────────────────────────────────────
  "titulaire", "titulaires", "co-titulaire", "cotitulaire", "bénéficiaire",
  "beneficiaire", "bénéficiaires", "beneficiaires", "donneur d'ordre",
  "virement", "virements", "prélèvement", "prelevement", "prélèvements",
  // The operation CODES of a bank statement — a ledger is riddled with them, and the
  // NER layer made « VIR » a company (« VOX », lived 13/08): every statement line
  // then spoke of a phantom business. Written the way banks
  // print them (uppercase, unaccented); case is folded at lookup.
  ...BANK_OP_CODES,
  "prelevements", "échéance", "echeance", "échéances", "echeances", "solde",
  "soldes", "débit", "debit", "crédit", "credit", "relevé", "releve",
  "relevés", "releves", "opération", "operation", "opérations", "operations",
  "libellé", "libelle", "montant", "montants", "total", "totaux", "ht", "ttc",
  "total ht", "total ttc", "acompte", "acomptes", "solde à payer",
  "solde a payer", "pénalités", "penalites", "escompte",
  "conditions de règlement", "conditions de reglement", "facturation",
  "règlement", "reglement", "impayé", "impaye", "impayés", "impayes",
  // ── Banque / facture — EN / DE / ES / IT / PT ─────────────────────────────
  "account holder", "beneficiary", "payee", "payer", "wire transfer",
  "direct debit", "statement", "balance", "instalment", "installment",
  "late fees", "payment terms", "subtotal",
  "kontoinhaber", "empfänger", "empfaenger", "überweisung", "lastschrift",
  "kontoauszug", "saldo", "rechnungsbetrag", "zahlungsbedingungen", "mahnung",
  "titular", "beneficiario", "beneficiaria", "transferencia", "domiciliación",
  "domiciliacion", "extracto", "vencimiento", "importe", "recargo",
  "intestatario", "beneficiario", "bonifico", "addebito", "estratto conto",
  "scadenza", "importo", "sollecito",
  "titular da conta", "beneficiário", "transferência", "transferencia",
  "débito direto", "debito direto", "extrato", "vencimento", "montante",
  // ── Administration — French ───────────────────────────────────────────────
  "préfecture", "prefecture", "sous-préfecture", "sous-prefecture", "mairie",
  "mairies", "commune", "communes", "canton", "cantons", "arrondissement",
  "arrondissements", "collectivité", "collectivite", "service public",
  "guichet", "guichets", "dossier", "dossiers", "référence dossier",
  "reference dossier", "numéro de dossier", "numero de dossier", "demandeur",
  "demandeuse", "demandeurs", "requérant", "requerant", "requérante",
  "requerante", "usager", "usagers", "administré", "administre",
  "instruction", "recours", "délai", "delai", "délais", "delais",
  "accusé de réception", "accuse de reception", "pièce justificative",
  "piece justificative", "pièces justificatives", "pieces justificatives",
  "justificatif", "justificatifs", "copie", "copies", "original", "originaux",
  "légalisé", "legalise", "légalisée", "legalisee", "apostille",
  "récépissé de dépôt", "recepisse de depot", "renouvellement",
  // ── Administration — EN / DE / ES / IT / PT ───────────────────────────────
  "applicant", "application", "town hall", "civil registry", "certified copy",
  "supporting document", "supporting documents", "acknowledgement of receipt",
  "processing time", "renewal",
  "antragsteller", "antragstellerin", "antrag", "bescheid", "behörde",
  "behoerde", "rathaus", "bürgeramt", "buergeramt", "beglaubigt", "nachweis",
  "unterlagen", "frist", "bearbeitungszeit",
  "solicitante", "solicitud", "ayuntamiento", "expediente administrativo",
  "compulsada", "justificante", "justificantes", "plazo", "renovación",
  "renovacion",
  "richiedente", "domanda", "istanza", "protocollo", "sportello",
  "autocertificazione", "ricevuta", "rinnovo",
  "requerente", "requerimento", "câmara municipal", "camara municipal",
  "certidão", "certidao", "comprovativo", "comprovativos", "prazo", "renovação",
  "renovacao",
  // ── Roles / team titles — the line under each face-book first name ───────────────
  // A team page alternates "Prénom" / "rôle" lines; the NER glues them into one span
  // ("Maurice Expert") or tags the role alone. Role words are KINDS, never identities.
  // (Uppercase renderings — "TECH", "PARTNERSHIP" — fold to the same entries.)
  "product", "produit", "design", "designer", "tech", "technique", "engineering",
  "ingénierie", "ingenierie", "développeur", "developpeur", "développeuse",
  // « ai » REMOVED: « Ai » is a first name (JP/CN) and the product redacts CJK —
  // sparing the team would cost the first name in clear. « ia »/« ml » are not.
  "developpeuse", "developer", "data", "ia", "ml", "sécurité", "securite",
  "security", "partnership", "partnerships", "partenariat", "partenariats",
  "marketing", "growth", "go-to-market", "sales", "ventes", "ops", "operations",
  "opérations", "support", "customer success", "expert", "experte", "expertes",
  "experts", "conseil", "advisory", "advisor", "board", "comité", "comite",
  "comité d'experts", "comite d'experts", "dpo", "rssi", "ciso", "cto", "ceo",
  "coo", "cfo", "cpo", "com", "communication", "presse", "press", "journalist",
  "journaliste", "journalistes", "rédac", "redac", "rédaction", "redaction",
  "rédacteur", "redacteur", "rédactrice", "redactrice", "rédac. chef",
  "red team", "red team & ai", "fondateur", "fondatrice", "founder", "cofondateur",
  "cofondatrice", "co-founder", "medialab", "média",
  // « media » (unaccented) is deliberately ABSENT — it doubles as a brand name,
  // and the discipline test (`orgAffixes.test.ts`) pins it. « média » stays.
  "lab", "labs",
  "science", "sciences", "recherche", "research", "institut", "institute",
  "gouvernement", "gouvernements", "government", "governments",
  // ── Savings & investment wrappers — TYPES, never identities ────────────────────────
  // The NER tags ORG acronyms (« PEA » → faked into an invented acronym, and a question of
  // financial literacy — « les ETF éligibles au PEA » — becomes a chart of nothing).
  // Same family as the iban/rcs labels already covered: the SCHEME is generic, the
  // account NUMBER stays redacted by its own rules.
  "pea", "pea-pme", "pel", "cel", "ldd", "ldds", "lep",
  "etf", "etfs", "tracker", "trackers", "sicav", "opcvm", "opci", "scpi",
  "fcp", "fcpi", "assurance-vie", "assurance vie", "compte-titres", "compte titres",
  "plan d'épargne", "plan d'epargne", "plan épargne", "plan epargne",
  "plan d'épargne en actions", "plan d'epargne en actions",
  "plan épargne retraite", "plan d'épargne retraite",
  "fonds", "fund", "funds", "dividende", "dividendes", "dividend", "dividends",
  "obligation", "obligations", "indice", "indices", "index funds", "index fund",
];
