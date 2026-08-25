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
 * Les CODES d'opération d'un relevé — leur PROPRE liste parce que deux endroits en ont
 * besoin (règle 9) : ici, pour qu'un code seul ne soit jamais une entité ; et le rognage
 * de span (`../pseudonymize/spanEdges.ts`), pour qu'un code COLLÉ devant un nom sorte du
 * span. Sans le second, « VIR Rebour » était UNE entité — le fournisseur recevait deux
 * faux (un pour « VIR Rebour », un pour « REBOUR ») et le type d'opération disparaissait.
 */
export const BANK_OP_CODES = ["vir", "prlv", "reçu", "recu", "chq", "vrst", "remise"] as const;

export const VIE_TERMS: string[] = [
  // ── Emploi & accompagnement — français ────────────────────────────────────
  // « emploi » manquait, et c'est LE mot d'une lettre de Pôle emploi : faké, tout le
  // document parle d'un métier inventé. « rendez » aussi — « rendez-vous » était
  // couvert, sa moitié non, d'où « tout troyes-vous fixé ».
  "emploi", "emplois", "rendez", "conseiller", "conseillère", "conseillere",
  "référent", "referent", "actualisation", "actualiser", "accompagnement",
  "demandeur d'emploi", "demandeurs d'emploi", "offre d'emploi", "offres d'emploi",
  "recherche d'emploi", "espace personnel", "allocation", "allocations",
  "indemnités", "indemnites", "cessation d'inscription", "mission locale",
  "cap emploi", "agence pour l'emploi", "service public de l'emploi",

  // ── Fonctions publiques électives & d'État — français ─────────────────────
  // Une FONCTION n'est jamais une identité. « maire » est délibérément ABSENT :
  // c'est aussi un patronyme français, comme « prevost » plus bas — la fonction perd.
  "ministre", "ministres", "secrétaire d'état", "secretaire d'etat", "préfet",
  "prefet", "préfète", "prefete", "sous-préfet", "sous-prefet", "député",
  "depute", "députée", "deputee", "sénateur", "senateur", "sénatrice",
  "senatrice", "conseiller municipal", "conseillère municipale",
  "conseillere municipale", "conseiller départemental", "adjoint au maire",
  "élu", "elu", "élue", "elue", "élus", "elus", "mandat électif", "commune",

  // ── Emploi / RH / paie — français ─────────────────────────────────────────
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
  // ── Immobilier / bail — français ──────────────────────────────────────────
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
  // ── Santé — français ──────────────────────────────────────────────────────
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
  // ── Santé — EN / DE / ES / IT / PT ────────────────────────────────────────
  "physician", "doctor", "practitioner", "nurse", "prescription", "dosage",
  "outpatient", "inpatient", "copay", "referral",
  "arzt", "ärztin", "aerztin", "hausarzt", "facharzt", "patientin", "rezept",
  "krankschreibung", "überweisung", "ueberweisung", "krankenkasse", "zuzahlung",
  "médico", "medico", "médica", "enfermero", "enfermera", "paciente", "receta",
  "consulta", "baja", "mutua", "copago",
  "medico di base", "paziente", "ricetta", "ticket", "visita", "ricovero",
  "médico de família", "medico de familia", "utente", "receita médica",
  "receita medica", "consulta médica", "baixa médica", "baixa medica",
  // ── École / formation — français ──────────────────────────────────────────
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
  // ── École — EN / DE / ES / IT / PT ────────────────────────────────────────
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
  // ── Greffe / registre / société — français ────────────────────────────────
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
  // ── Banque / facture — français ───────────────────────────────────────────
  "titulaire", "titulaires", "co-titulaire", "cotitulaire", "bénéficiaire",
  "beneficiaire", "bénéficiaires", "beneficiaires", "donneur d'ordre",
  "virement", "virements", "prélèvement", "prelevement", "prélèvements",
  // Les CODES d'opération d'un relevé bancaire — un grand livre en est truffé, et la
  // couche NER faisait de « VIR » une société (« VOX », vécu 13/08) : chaque ligne du
  // relevé parlait alors d'une entreprise fantôme. Écrits comme les banques les
  // impriment (majuscules sans accent) ; la casse est pliée au lookup.
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
  // ── Administration — français ─────────────────────────────────────────────
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
  // ── Rôles / intitulés d'équipe — la ligne sous chaque prénom d'un trombinoscope ──
  // A team page alternates "Prénom" / "rôle" lines; the NER glues them into one span
  // ("Maurice Expert") or tags the role alone. Role words are KINDS, never identities.
  // (Uppercase renderings — "TECH", "PARTNERSHIP" — fold to the same entries.)
  "product", "produit", "design", "designer", "tech", "technique", "engineering",
  "ingénierie", "ingenierie", "développeur", "developpeur", "développeuse",
  // « ai » RETIRÉ : « Ai » est un prénom (JP/CN) et le produit redacted le CJK —
  // épargner l'équipe coûterait le prénom en clair. « ia »/« ml » n'en sont pas.
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
  // « media » (sans accent) est délibérément ABSENT — il double comme nom de marque,
  // et le test de discipline (`orgAffixes.test.ts`) l'épingle. « média » reste.
  "lab", "labs",
  "science", "sciences", "recherche", "research", "institut", "institute",
  "gouvernement", "gouvernements", "government", "governments",
  // ── Enveloppes & produits d'épargne / placement — des TYPES, jamais des identités ──
  // Le NER tague les sigles ORG (« PEA » → faké en acronyme inventé, et une question de
  // culture financière — « les ETF éligibles au PEA » — devient un graphique de rien).
  // Même famille que les labels iban/rcs déjà couverts : le SCHÉMA est générique, le
  // NUMÉRO de compte reste redacted par ses propres règles.
  "pea", "pea-pme", "pel", "cel", "ldd", "ldds", "lep",
  "etf", "etfs", "tracker", "trackers", "sicav", "opcvm", "opci", "scpi",
  "fcp", "fcpi", "assurance-vie", "assurance vie", "compte-titres", "compte titres",
  "plan d'épargne", "plan d'epargne", "plan épargne", "plan epargne",
  "plan d'épargne en actions", "plan d'epargne en actions",
  "plan épargne retraite", "plan d'épargne retraite",
  "fonds", "fund", "funds", "dividende", "dividendes", "dividend", "dividends",
  "obligation", "obligations", "indice", "indices", "index funds", "index fund",
];
