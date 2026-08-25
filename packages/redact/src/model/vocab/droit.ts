/**
 * Vocabulary volume: **legal procedure and contracts** — the connectors of a judgment,
 * the parties, the remedies, and the boilerplate of an agreement — FR/EN/DE/ES/IT/PT.
 * Discipline: `./index`. The document-TYPE words ("jugement", "assignation", "bail")
 * already live in `genericTermsData.ts`; this volume is the language AROUND them.
 *
 * Why it exists: measured 5/12. A judgment reads "ATTENDU QUE … PAR CES MOTIFS" in
 * capitals, which is exactly the shape a NER reads as a proper noun, and "nonobstant",
 * "référé" or "mise en demeure" were faked into invented names in the middle of a
 * decision — while the litigants' real identities were (correctly) vaulted beside them.
 *
 * ⚠️ Deliberately ABSENT: `richter` (German for judge AND one of the most common German
 * surnames), bare `justice` (an English given name), `prévôt` / `bailly` / `sergent`
 * (French surnames), `abogado` is fine but `procurador` stays because it is a role, not
 * a name. When a role word is also a family name, the role loses.
 */
export const DROIT_TERMS: string[] = [
  // ── Connecteurs & structure d'une décision — français ──────────────────────
  "nonobstant", "attendu", "attendu que", "considérant", "considerant",
  "considérant que", "considerant que", "par ces motifs", "en conséquence",
  "en consequence", "dispositif", "motifs", "moyens", "exposé des faits",
  "expose des faits", "exposé du litige", "expose du litige", "en fait",
  "en droit", "sur ce", "il résulte", "il resulte", "en tout état de cause",
  "en tout etat de cause", "à titre principal", "a titre principal",
  "à titre subsidiaire", "a titre subsidiaire", "sous réserve", "sous reserve",
  "le cas échéant", "le cas echeant", "ci-après", "ci-apres", "ci-dessus",
  "susvisé", "susvise", "précité", "precite", "article", "articles", "alinéa",
  "alinea", "paragraphe", "annexe", "préambule", "preambule",
  // Structure documentaire — les têtes de section qu'une « initiale + Mot » de plan
  // ("B. Introduction") ferait passer pour un patronyme sans elles.
  "introduction", "conclusion", "sommaire", "chapitre", "glossaire", "appendice",
  "avant-propos",

  // ── Parties, juridictions, procédure — français ────────────────────────────
  "demandeur", "demanderesse", "défendeur", "defendeur", "défenderesse",
  "defenderesse", "requérant", "requerant", "requérante", "requerante",
  "appelant", "appelante", "intimé", "intime", "intimée", "intimee", "partie",
  "parties", "partie adverse", "tiers", "mis en cause", "intervenant volontaire",
  "conseil", "avocat", "avocate", "notaire", "commissaire de justice",
  "magistrat", "juge", "juge des référés", "juge des referes", "président",
  "president", "procureur", "ministère public", "ministere public", "greffier",
  "juridiction", "compétence", "competence", "ressort", "instance",
  "première instance", "premiere instance", "chambre", "audience", "plaidoirie",
  "délibéré", "delibere", "prononcé", "prononce", "référé", "refere",
  "assignation en référé", "mise en état", "mise en etat", "instruction",
  "appel", "pourvoi", "cassation", "voie de recours", "délai de recours",
  "delai de recours", "signification", "notification", "comparution",
  "défaut", "defaut", "contradictoire", "opposition", "renvoi", "radiation",

  // ── Régimes matrimoniaux & état civil des actes — français ─────────────────
  // Un acte notarié écrit « mariés sous le régime de la communauté réduite aux
  // acquêts » et la couche NER en faisait une SOCIÉTÉ (« corvanics technologies
  // roubaix », vécu 13/08) : le régime matrimonial du client devenait une entreprise
  // inventée, l'acte restitué absurde. Ce sont des KINDS de régime, jamais des noms.
  "communauté", "communaute", "acquêts", "acquets", "réduite", "reduite",
  "universelle", "matrimonial", "matrimoniale", "matrimoniaux", "indivision",
  // (« séparation de biens » : « séparation » + « biens » ci-dessous ; le composé
  // tombe par `isGenericCompound`.)
  "séparation", "separation", "biens",
  // ── Effets, sanctions, obligations — français ──────────────────────────────
  "mise en demeure", "injonction", "injonction de payer", "sommation de payer",
  "condamnation", "débouté", "deboute", "astreinte", "dommages et intérêts",
  "dommages et interets", "préjudice", "prejudice", "indemnisation",
  "indemnité", "indemnite", "réparation", "reparation", "exécution provisoire",
  "execution provisoire", "exécution forcée", "execution forcee", "saisie",
  "dépens", "depens", "frais irrépétibles", "frais irrepetibles",
  "responsabilité", "responsabilite", "faute", "manquement", "inexécution",
  "inexecution", "résiliation", "resiliation", "résolution du contrat",
  "resolution du contrat", "nullité", "nullite", "caducité", "caducite",
  "prescription", "forclusion", "déchéance", "decheance", "clause",
  "clause pénale", "clause penale", "stipulation", "engagement", "obligation",
  "créance", "creance", "créancier", "creancier", "débiteur", "debiteur",
  "solidarité", "solidarite", "cautionnement", "garantie légale",
  "garantie legale", "vice caché", "vice cache", "force majeure",
  "litige", "contentieux", "transaction", "médiation", "mediation",
  "conciliation", "arbitrage", "sentence arbitrale", "protocole d'accord",
  "confidentialité", "confidentialite", "non-concurrence", "propriété",
  "propriete", "propriété intellectuelle", "propriete intellectuelle",
  "droit applicable", "loi applicable", "juridiction compétente",
  "juridiction competente", "code civil", "code pénal", "code penal",
  "code du travail", "code de commerce", "jurisprudence", "doctrine",

  // ── English ────────────────────────────────────────────────────────────────
  "whereas", "hereinafter", "hereby", "herein", "thereof", "notwithstanding",
  "pursuant to", "subject to", "provided that", "in witness whereof",
  "plaintiff", "claimant", "defendant", "appellant", "respondent", "petitioner",
  "party", "parties", "third party", "counterparty", "counsel", "attorney",
  "solicitor", "barrister", "notary", "judge", "court", "tribunal", "bench",
  "jurisdiction", "venue", "hearing", "trial", "pleading", "motion", "brief",
  "injunction", "subpoena", "summons", "writ", "affidavit", "deposition",
  "discovery", "disclosure", "testimony", "witness", "evidence", "exhibit",
  "verdict", "ruling", "judgment", "judgement", "decree", "order", "appeal",
  "settlement", "damages", "liability", "indemnity", "indemnification",
  "breach", "default", "remedy", "specific performance", "termination",
  "rescission", "waiver", "severability", "clause", "provision", "covenant",
  "warranty", "representation", "obligation", "creditor", "debtor",
  "governing law", "statute", "regulation", "case law", "precedent",
  "limitation period", "statute of limitations", "force majeure",
  "confidentiality", "non-disclosure agreement", "non-compete",
  "intellectual property", "arbitration", "mediation", "litigation",
  "power of attorney", "enforcement", "costs", "legal fees",

  // ── Deutsch ────────────────────────────────────────────────────────────────
  "kläger", "klager", "klägerin", "klagerin", "beklagter", "beklagte",
  "antragsteller", "antragsgegner", "prozessbevollmächtigter", "rechtsanwalt",
  "rechtsanwältin", "rechtsanwaltin", "notar", "staatsanwalt", "gericht",
  "amtsgericht", "landgericht", "oberlandesgericht", "bundesgerichtshof",
  "kammer", "verhandlung", "termin", "urteil", "beschluss", "verfügung",
  "verfugung", "klage", "klageschrift", "berufung", "revision", "beschwerde",
  "einspruch", "frist", "verjährung", "verjahrung", "mahnung", "mahnbescheid",
  "vollstreckung", "zwangsvollstreckung", "pfändung", "pfandung",
  "schadensersatz", "haftung", "verschulden", "pflichtverletzung", "vertrag",
  "vertragsstrafe", "klausel", "kündigung", "kundigung", "widerruf",
  "rücktritt", "rucktritt", "anfechtung", "nichtigkeit", "gewährleistung",
  "gewahrleistung", "bürgschaft", "burgschaft", "vollmacht", "zeuge", "zeugin",
  "gutachten", "sachverständiger", "sachverstandiger", "vergleich",
  "schiedsverfahren", "gerichtsstand", "anwendbares recht", "geheimhaltung",

  // ── Español ────────────────────────────────────────────────────────────────
  "demandante", "demandado", "demandada", "recurrente", "recurrido", "parte",
  "partes", "tercero", "letrado", "abogado", "abogada", "procurador", "notario",
  "juez", "jueza", "magistrado", "fiscal", "juzgado", "tribunal", "sala",
  "audiencia", "vista", "juicio", "demanda", "escrito", "alegaciones",
  "contestación", "contestacion", "recurso", "apelación", "apelacion",
  "casación", "casacion", "sentencia", "auto", "providencia", "diligencia",
  "plazo", "prescripción", "prescripcion", "caducidad", "requerimiento",
  "burofax", "ejecución", "ejecucion", "embargo", "indemnización",
  "indemnizacion", "daños y perjuicios", "danos y perjuicios",
  "responsabilidad", "incumplimiento", "cláusula", "clausula", "cláusula penal",
  "clausula penal", "contrato", "rescisión", "rescision", "resolución",
  "resolucion", "nulidad", "garantía", "garantia", "fianza", "poder notarial",
  "testigo", "prueba", "peritaje", "perito", "acuerdo", "arbitraje",
  "mediación", "mediacion", "fuero", "legislación aplicable",
  "legislacion aplicable", "confidencialidad", "propiedad intelectual",

  // ── Italiano ───────────────────────────────────────────────────────────────
  "attore", "convenuto", "convenuta", "ricorrente", "resistente", "parte",
  "parti", "terzo", "difensore", "avvocato", "avvocata", "notaio", "giudice",
  "giudice di pace", "magistrato", "pubblico ministero", "cancelliere",
  "tribunale", "corte d'appello", "corte di cassazione", "sezione", "udienza",
  "atto di citazione", "comparsa", "memoria", "ricorso", "appello",
  "cassazione", "sentenza", "decreto", "ordinanza", "termine", "prescrizione",
  "decadenza", "diffida", "messa in mora", "ingiunzione", "decreto ingiuntivo",
  "esecuzione", "pignoramento", "risarcimento", "danni", "responsabilità",
  "responsabilita", "inadempimento", "clausola", "clausola penale",
  "contratto", "recesso", "risoluzione", "nullità", "nullita", "garanzia",
  "fideiussione", "procura", "testimone", "prova", "perizia", "consulente",
  "transazione", "arbitrato", "mediazione", "foro competente",
  "legge applicabile", "riservatezza", "proprietà intellettuale",

  // ── Português ──────────────────────────────────────────────────────────────
  "autor", "autora", "réu", "reu", "requerente", "requerido", "parte",
  "partes", "terceiro", "advogado", "advogada", "notário", "notario", "juiz",
  "juíza", "juiza", "magistrado", "promotor", "ministério público",
  "ministerio publico", "escrivão", "escrivao", "tribunal", "juízo", "juizo",
  "vara", "audiência", "audiencia", "petição inicial", "peticao inicial",
  "contestação", "contestacao", "recurso", "apelação", "apelacao", "sentença",
  "sentenca", "acórdão", "acordao", "despacho", "prazo", "prescrição",
  "prescricao", "notificação", "notificacao", "interpelação", "interpelacao",
  "execução", "execucao", "penhora", "indemnização", "indemnizacao",
  "indenização", "indenizacao", "danos", "responsabilidade", "incumprimento",
  "cláusula", "clausula", "cláusula penal", "clausula penal", "contrato",
  "rescisão", "rescisao", "resolução", "resolucao", "nulidade", "garantia",
  "fiança", "fianca", "procuração", "procuracao", "testemunha", "prova",
  "perícia", "pericia", "acordo", "arbitragem", "mediação", "mediacao",
  "foro", "lei aplicável", "lei aplicavel", "confidencialidade",
];
