/**
 * The GENERIC_TERMS deny-list data (document/design/file-type words, identifier LABELS,
 * ARIA roles, FR legal vocabulary…) — split out of `genericTerms.ts` to keep that file's
 * predicates under the 300-LOC cap. Pure data; the predicates live in `genericTerms.ts`.
 */
import { VOCAB_TERMS, ARIA_ROLE_TERMS } from "./vocab";
// Generic document / design / file-TYPE words + common abbreviations (FR + EN)
// that name a KIND of thing, not an identity. A small detector over-flags one as
// a NAME/ORG (e.g. a Canva design literally titled "CV" → faked to "At"), which
// then leaks a wrong-looking title AND stops the app from finding the design. As
// with STOPWORDS, only a candidate whose ENTIRE value is one of these is dropped —
// a multi-word span ("CV Jean Morvan" → the model flags "Jean Morvan" separately)
// is unaffected. Keep to truly generic type words; never brand/company-ambiguous.
export const GENERIC_TERMS = new Set<string>([
  // The per-domain vocabulary volumes (administration, vie quotidienne, technique,
  // santé, éducation, droit, gestion, vie professionnelle — each multilingual) live in
  // `vocab/`, one file per domain. That barrel's header carries the allow-list
  // discipline they all share; this file keeps only the cross-domain words below.
  ...VOCAB_TERMS,
  "cv", "resume", "résumé", "resumé", "curriculum", "vitae", "curriculum vitae",
  "facture", "invoice", "devis", "quote", "quotation", "rapport", "report",
  "budget", "contrat", "contract", "lettre", "letter", "note", "memo", "document",
  "doc", "présentation", "presentation", "diapo", "diaporama", "slide", "slides",
  "brief", "portfolio", "logo", "bannière", "banner", "affiche", "poster",
  "flyer", "prospectus", "brochure", "dépliant", "template", "modèle", "mockup",
  "maquette", "planning", "agenda", "calendrier", "calendar", "tableau", "feuille",
  "sheet", "formulaire", "form", "newsletter", "infographie", "infographic",
  "post", "publication", "cover", "couverture", "menu", "carte", "invitation",
  "certificat", "certificate", "diplôme", "diplome", "attestation", "badge",
  "étiquette", "etiquette", "sticker", "autocollant",
  // Email / web infrastructure common nouns — a NER mis-tags a bare "mail"/"email"
  // (from an "Email:" field / "Gmail") as an ORG and, replaced as a substring, it
  // bled into "email"→"eVoxa" / "gmail"→"gVoxa" and leaked email local-parts. None is
  // PII as a standalone value (only an exact standalone match is dropped).
  "mail", "email", "e-mail", "emails", "courriel", "webmail", "inbox",
  "www", "http", "https", "url", "lien", "link", "web", "site",
  // The ARIA/accessibility ROLE volume — a browser-agent snapshot is made of these.
  ...ARIA_ROLE_TERMS,
  // Identifier / field LABELS (the label word itself is never PII — the VALUE it
  // introduces is caught by its own structured rule; a NER mis-tags a bare "IBAN" /
  // "RCS" header as an ORG). Separator-insensitive above, so "R.C.S"/"S.I.R.E.N" match.
  "iban", "bic", "swift", "rib", "rcs", "siren", "siret", "tva", "vat", "spi", "nir",
  // Étiquettes de compte : mesurées comme faux positifs (« Mon login est arvio92 » →
  // « login » redacted en prénom, arvio92 laissé en clair). Le label n'est jamais la
  // donnée ; la valeur qui suit relève de sa propre règle.
  "login", "logins", "pseudo", "pseudos", "pseudonyme", "identifiant", "identifiants",
  "username", "utilisateur", "utilisateurs", "nom d'utilisateur", "handle", "matricule",
  "urssaf", "insee", "ape", "naf", "kbis", "cerfa", "sepa", "bban", "uen",
  // Pièces d'identité + étiquettes de compte manquantes, MESURÉES comme faux positifs
  // (« Mon passeport est périmé » → « Mon Simon est périmé » ; idem CNI → prénom, sécu →
  // prénom, gamertag → prénom). Même raison que la ligne au-dessus : le mot désigne le
  // TYPE de pièce, jamais son titulaire. ⚠️ « signe » (jumeau ASCII de « signé ») est
  // volontairement ABSENT — c'est un prénom scandinave, cf. la règle 2 de `vocab/index.ts`.
  "passeport", "passeports", "passport", "cni", "sécu", "secu", "gamertag", "gamertags",
  // Legal / official DOCUMENT type words (FR + a few EN) — the KIND of a document,
  // never an identity. A payslip/contract's headings shouldn't be faked to a name/org.
  "statuts", "statut", "procuration", "mandat", "bail", "avenant", "acte", "jugement",
  "assignation", "requête", "requete", "ordonnance", "quittance", "avoir", "sommation",
  "testament", "donation", "succession", "compromis", "convention", "protocole",
  "règlement", "reglement", "délibération", "deliberation", "résolution", "resolution",
  "procès-verbal", "proces-verbal", "quitus", "mainlevée", "mainlevee", "conclusions",
  "plainte", "citation", "signification", "constat", "expertise", "bordereau",
  "récépissé", "recepisse", "notification", "relance", "convocation", "cotisation",
  "cotisations", "bulletin", "récapitulatif", "recapitulatif", "décompte", "decompte",
  // French CO-OWNERSHIP / general-assembly vocabulary (AG notices, procès-verbaux,
  // convocations, règlements de copropriété): procedural BODIES / ROLES / units, never
  // a specific named organisation or person. A NER mis-tagged "assemblée générale" as
  // an ORG → "norwood labs", "assemblée" → a fake company, "syndic" → a fake NAME
  // ("Jules"), corrupting the whole legal notice. Article-stripping ("l'assemblée" →
  // "assemblée") + separator-insensitivity make the elided/spaced forms match too.
  "assemblée", "assemblée générale", "assemblées", "assemblées générales",
  "assemblée générale ordinaire", "assemblée générale extraordinaire",
  "syndic", "syndicat", "syndicat des copropriétaires",
  "copropriété", "copropriétés", "copropriétaire", "copropriétaires",
  "conseil syndical", "conseil d'administration", "ordre du jour",
  "mandataire", "mandataires", "mandant",
  "tantièmes", "millièmes", "quote-part", "quotes-parts",
  "propriétaire", "propriétaires", "locataire", "locataires", "bailleur",
  "président", "présidente", "secrétaire", "trésorier", "gérant",
  // NOTARIAL-DEED party roles + property/legal common nouns (promesses, actes de
  // vente, saisies). All-caps defined vocables in a deed ("le PROMETTANT", "le
  // BIEN", "la jouissance") read as ORG/PER to a NER and were faked to companies
  // and CITIES ("BIEN" → "CAEN", "jouissance" → "versailles", "vendre" → "annecy",
  // "Code monétaire et financier" → two org fakes) — the deed becomes legally
  // unreadable and none of it is anyone's identity. Accent-less spellings included
  // (OCR'd deeds drop diacritics); the compound gate then drops "code civil" &c.
  "promettant", "promettants", "acquéreur", "acquereur", "acquéreurs", "acquereurs",
  "bénéficiaire", "beneficiaire", "bénéficiaires", "beneficiaires",
  "vendeur", "vendeurs", "venderesse", "preneur", "preneurs",
  "créancier", "creancier", "créanciers", "creanciers", "débiteur", "debiteur",
  "notaire", "notaires", "notarial", "notariale", "office notarial",
  "juge", "avocat", "avocats", "huissier", "greffe", "greffier",
  "immeuble", "immeubles", "immobilier", "immobilière", "immobiliere",
  "mobilier", "mobiliers", "cadastre", "cadastral", "cadastrale",
  "jouissance", "exécution", "execution", "cour", "saisie", "commandement",
  "vente", "ventes", "achat", "achats", "vendre", "acheter", "louer",
  "promesse", "promesses", "monétaire", "monetaire", "financier", "financière",
  "financiere", "civil", "civile", "urbanisme", "superficie",
  // "Code" — the law-corpus word ("Code civil", "Code monétaire et financier",
  // "Code de l'urbanisme"): with it covered, the compound gate drops the whole
  // title instead of faking it to org names.
  "code", "codes",
  // Financial-statement TITLE words (compte de résultat, bilan, liasse) — a
  // Title-Cased document heading must never read as a company denomination
  // (the SIREN-header pair gate keys off this) nor be faked by a NER.
  "compte", "comptes", "résultat", "resultat", "résultats", "resultats",
  "exercice", "exercices", "bilan", "bilans", "actif", "passif",
  "prévisionnel", "previsionnel", "chiffre d'affaires",
  // Payslip / accounting HEADER words (columns/rows of a form) — never a name.
  "montant", "montants", "total", "totaux", "sous-total", "net", "brut", "salaire",
  "salaires", "taux", "base", "plafond", "retenue", "retenues", "prélèvement",
  "prelevement", "prélèvements", "prelevements", "échéance", "echeance", "solde",
  "débit", "debit", "crédit", "credit", "référence", "reference", "matricule",
  "période", "periode", "libellé", "libelle", "désignation", "designation",
  "quantité", "quantite", "coefficient", "gain", "gains", "retenu",
  // Company legal FORMS + descriptors + associate/officer ROLES — a KIND of legal
  // entity/role, never a SPECIFIC named org or person. A NER/LLM faked a standalone
  // "SASU" / "Associé Unique" / "société" to a company (`Associé Unique` → "Ashborne
  // Group"); these are ALSO stripped when they lead/trail a real org name ("société
  // MILO STUDIO" → "MILO STUDIO", see `ORG_AFFIX`/`stripOrgAffixes`). Curated to
  // UNAMBIGUOUS forms/roles — bare "sa"/"co"/"ei" are omitted (a stopword or a name).
  "sas", "sasu", "sarl", "eurl", "snc", "sci", "scop", "gie", "scs", "sca",
  "selarl", "selas", "sccv", "scm", "scp", "gaec", "earl", "eirl",
  "société", "societe", "sté", "ste", "sociétés", "societes",
  "entreprise", "entreprises", "compagnie", "cie", "cabinet", "enseigne",
  "établissement", "etablissement", "établissements", "etablissements",
  "association", "associations", "fondation", "coopérative", "cooperative", "mutuelle",
  "associé", "associée", "associés", "associées", "associé unique", "associée unique",
  "cogérant", "cogérante", "co-gérant", "dirigeant", "dirigeante",
  "actionnaire", "actionnaires", "sociétaire", "sociétaires",
  "raison sociale", "dénomination sociale", "denomination sociale", "forme juridique",
  // ── Courtesy / greetings / sign-offs — mail boilerplate a NER routinely tags as a
  // NAME ("Cordialement" → faked to a person). Never an identity standalone.
  "bonjour", "bonsoir", "merci", "cordialement", "bien cordialement", "bien à vous",
  "salutations", "sincères salutations", "bienvenue", "félicitations", "bravo",
  "hello", "thanks", "thank you", "regards", "best regards", "kind regards", "sincerely",
  // ── Honorifics / titles — the TITLE is never the identity (the name beside it is
  // detected as its own span; only an exact standalone match is dropped).
  "monsieur", "madame", "mademoiselle", "messieurs", "mesdames", "docteur", "professeur",
  "maître", "maitre", "mr", "mrs", "dr", "sir", "madam", "herr", "frau",
  "señor", "señora", "signor", "signora",
  // ── Days + UNAMBIGUOUS months — a mis-tagged date word faked to a name corrupts
  // the model's date math irreversibly. Curated: mars/avril/mai and march/april/may/
  // june/august are OMITTED (real first names / surnames — the allow-list discipline).
  "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche",
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
  "janvier", "février", "fevrier", "juin", "juillet", "août", "aout",
  "septembre", "octobre", "novembre", "décembre", "decembre",
  "january", "february", "july", "september", "october", "november", "december",
  // ── Party / role KIND words — "Client", "Fournisseur", "Manager" name a ROLE,
  // never a specific person/company; a NER standalone-tags them constantly in CRM
  // and invoice content.
  "client", "clients", "cliente", "clientes", "fournisseur", "fournisseurs",
  "prestataire", "prestataires", "partenaire", "partenaires",
  "collaborateur", "collaboratrice", "collaborateurs", "salarié", "salariée", "salariés",
  "employé", "employée", "employés", "employeur", "consultant", "consultante",
  "stagiaire", "directeur", "directrice", "direction", "responsable", "manager",
  "équipe", "équipes", "equipe", "chef de projet", "pdg", "drh", "rh",
  "ressources humaines", "ceo", "cto", "cfo",
  "customer", "customers", "supplier", "employee", "employees", "employer", "team", "staff",
  // ── Business-transaction KIND words (order/delivery/payment/meeting vocabulary).
  "commande", "commandes", "bon de commande", "livraison", "livraisons",
  "paiement", "paiements", "remboursement", "virement", "virements", "abonnement",
  "abonnements", "réunion", "reunion", "réunions", "rendez-vous", "rdv",
  "projet", "projets", "dossier", "dossiers", "meeting", "meetings",
  // ── Tech KIND words — infrastructure common nouns a NER mis-tags as orgs.
  "internet", "wifi", "wi-fi", "cloud", "serveur", "serveurs", "server", "servers",
  "application", "applications", "appli", "logiciel", "logiciels", "software",
  "hardware", "ordinateur", "ordinateurs", "smartphone", "téléphone", "telephone",
  "base de données", "database", "navigateur", "browser",
  // ── Legal / official DOCUMENT type words, ~10 more languages ────────────────
  // A KIND of document, never an identity — so a mis-tagged heading in a foreign
  // contract/payslip isn't faked to a name/org. Curated to COMPOUND / unambiguous
  // nouns; short words that double as a first name/surname are deliberately omitted
  // (e.g. IT/ES "IVA" = "Iva" the name). Lookup stays ONE O(1) Set — languages here
  // are for coverage, not cost.
  // English (extra)
  "agreement", "affidavit", "deed", "waiver", "subpoena", "summons", "complaint",
  "petition", "judgment", "judgement", "verdict", "settlement", "lease", "tenancy",
  "testament", "probate", "bylaws", "minutes", "resolution", "statement",
  "payslip", "payroll", "receipt", "warrant", "indemnity", "covenant", "articles",
  // German
  "vertrag", "rechnung", "quittung", "beleg", "bescheinigung", "urkunde", "bescheid",
  "mahnung", "kündigung", "kuendigung", "vollmacht", "satzung", "protokoll", "beschluss",
  "antrag", "vereinbarung", "gutachten", "mahnbescheid", "mietvertrag", "arbeitsvertrag",
  "lohnabrechnung", "gehaltsabrechnung", "kontoauszug", "umsatzsteuer", "mwst", "ustidnr",
  "steuernummer", "handelsregister",
  // Spanish
  "contrato", "factura", "recibo", "escritura", "poder", "sentencia", "demanda",
  "requerimiento", "testamento", "herencia", "donación", "donacion", "estatutos",
  "resolución", "resolucion", "notificación", "notificacion", "certificado",
  "declaración", "declaracion", "presupuesto", "nómina", "nomina", "extracto",
  "albarán", "albaran", "pagaré", "pagare", "finiquito",
  // Italian
  "contratto", "fattura", "ricevuta", "atto", "procura", "sentenza", "citazione",
  "testamento", "statuto", "verbale", "delibera", "notifica", "certificato",
  "dichiarazione", "preventivo", "quietanza", "decreto", "ingiunzione",
  "codicefiscale", "codice fiscale", "partita iva",
  // Portuguese
  "fatura", "factura", "recibo", "escritura", "procuração", "procuracao", "sentença",
  "sentenca", "requerimento", "estatutos", "deliberação", "deliberacao", "notificação",
  "notificacao", "certidão", "certidao", "declaração", "declaracao", "orçamento",
  "orcamento", "comprovante", "nota fiscal", "cnpj", "cpf",
  // Dutch
  "overeenkomst", "factuur", "kwitantie", "bewijs", "verklaring", "akte", "vonnis",
  "dagvaarding", "statuten", "notulen", "besluit", "aanmaning", "volmacht", "offerte",
  "loonstrook", "rekeningafschrift", "btw", "kvk",
  // Polish
  "umowa", "faktura", "rachunek", "zaświadczenie", "zaswiadczenie", "wyrok",
  "pozew", "wezwanie", "statut", "protokół", "protokol", "uchwała", "uchwala",
  "powiadomienie", "deklaracja", "oferta", "nip", "regon", "pesel",
  // Chinese (中文)
  "合同", "协议", "发票", "收据", "报告", "证书", "证明", "声明", "通知", "授权书",
  "委托书", "判决书", "起诉状", "遗嘱", "章程", "决议", "账单", "对账单", "工资单",
  // Japanese (日本語)
  "契約書", "請求書", "領収書", "報告書", "証明書", "議事録", "委任状", "遺言書",
  "定款", "通知書", "申請書", "明細書", "給与明細",
  // Korean (한국어)
  "계약서", "청구서", "영수증", "보고서", "증명서", "위임장", "유언장", "정관",
  "통지서", "신청서", "명세서", "급여명세서",
  // ── Ubiquitous DATA / UI / STATUS / metric words (multilingual) ──────────────
  // They FLOOD tool output — pandas frames, spreadsheets, browser snapshots, error
  // strings ("Colonnes", "World", "Erreur", "Résultat") — and a NER standalone-tags
  // one as a NAME/ORG/PLACE, faking it ("World"→a company, "Colonnes"→a city) and
  // corrupting the data the model reads back. None is EVER PII on its own. Curated to
  // UNAMBIGUOUS generics — anything that doubles as a first name/surname/brand is
  // omitted (max, media, rose, été, mai, iva, dane…), per the allow-list discipline.
  // Data / table / spreadsheet
  "colonne", "colonnes", "column", "columns", "columna", "columnas", "colonna", "coluna",
  "colunas", "spalte", "spalten", "kolom", "kolumna", "row", "rows", "linha", "linhas",
  "zeile", "zeilen", "value", "values", "valeur", "valeurs", "valor", "valore", "valori",
  "wert", "werte", "waarde", "cellule", "celda", "cella", "zelle",
  "data", "données", "donnees", "datos", "dati", "dados", "daten", "gegevens",
  "index", "indice", "índice", "header", "entête", "en-tête", "encabezado", "kopfzeile",
  // Aggregates / metrics (spreadsheet + financial output)
  "totale", "totales", "subtotal", "sum", "summe", "somma", "soma", "moyenne", "average",
  "promedio", "durchschnitt", "count", "number", "numéro", "número", "numero", "nummer",
  "numer", "rank", "rang", "rango", "ranking", "classement", "price", "prix", "precio",
  "prezzo", "preis", "prijs", "rate", "percent", "percentage", "pourcentage", "porcentaje",
  "prozent", "performance", "rendement", "rendimiento",
  // Status / result / error / boolean
  "result", "results", "résultat", "résultats", "resultat", "resultado", "resultados",
  "risultato", "risultati", "ergebnis", "resultaat", "wynik", "error", "errors", "erreur",
  "erreurs", "errore", "errori", "erro", "fehler", "fout", "warning", "avertissement",
  "advertencia", "warnung", "success", "succès", "succes", "éxito", "exito", "erfolg",
  "failed", "failure", "échec", "echec", "empty", "vide", "null", "true", "false", "vrai",
  "faux", "verdadero", "falso", "wahr", "falsch",
  // Search / filter / sort + ubiquitous common nouns
  "search", "recherche", "búsqueda", "busqueda", "ricerca", "suche", "zoeken", "szukaj",
  "filter", "filtre", "filtro", "sort", "world", "monde", "mundo", "mondo", "welt", "wereld",
  "week", "semaine", "semana", "settimana", "woche", "year", "année", "annee", "año", "anno",
  "jahr", "time", "temps", "tiempo", "tempo", "zeit", "chart", "graph", "graphique",
  "grafico", "gráfico", "diagramm", "grafiek", "wykres",
  // Time-of-day / everyday-place common nouns the title-cased NER pass surfaces
  // ("Matin", "Antenne" read as proper nouns once capitalized). Never PII alone.
  "matin", "soir", "midi", "minuit", "après-midi", "apres-midi",
  "aujourd'hui", "demain", "hier", "today", "tomorrow", "yesterday",
  "morning", "evening", "night", "antenne", "antennes", "agence", "agences",
  "bureau", "bureaux", "gare", "gares", "aéroport", "aeroport", "airport",
  // ── API / analytics tool vocabulary — MCP tool metadata and analytics results
  // (PostHog, GitHub…) flood tool output with these; the labeled-field detector read
  // a YAML "name: read-data-schema" as a PERSON and the per-word name-identity
  // machinery then faked every occurrence of "data"/"schema"/"query" conversation-wide
  // ("data"→"lucas", "UTC"→"HAL" — the reported overredaction). None is EVER PII
  // standalone. Same allow-list discipline: name-doubling words are omitted.
  // CRUD / API verbs + schema nouns
  "read", "write", "run", "exec", "execute", "call", "fetch", "create", "update",
  "delete", "insert", "select", "tool", "tools", "outil", "outils", "command",
  "parameter", "parameters", "paramètre", "paramètres", "parametre", "parametres",
  "input", "inputs", "output", "outputs", "string", "integer", "boolean",
  "object", "array", "json", "yaml", "xml", "api", "sdk", "endpoint", "endpoints",
  "schema", "schemas", "schéma", "schémas", "name", "title", "titre",
  "kind", "type", "types", "description",
  // Analytics nouns
  "query", "queries", "trend", "trends", "tendance", "tendances", "overview",
  "aperçu", "apercu", "insight", "insights", "dashboard", "dashboards",
  "metric", "metrics", "métrique", "métriques", "metrique", "metriques",
  "event", "events", "événement", "événements", "evenement", "evenements",
  "property", "properties", "propriété", "propriétés", "propriete", "proprietes",
  "session", "sessions", "recording", "recordings", "enregistrement", "enregistrements",
  "funnel", "funnels", "cohort", "cohorts", "cohorte", "cohortes", "retention",
  "rétention", "pageview", "pageviews", "visitor", "visitors", "visiteur", "visiteurs",
  "analytics", "analytique", "analytiques", "timezone", "utc", "gmt",
  // PROTOCOL / FORMAT acronyms. The block above covered the schema nouns but not the
  // protocol names, and this app's own traffic is saturated with them: an agentic turn
  // ships tool metadata, connector catalogues and SQL results, where a bare 3-letter
  // acronym is exactly what a cased NER tags as an ORG. Faked, « MCP » became a 3-letter
  // invented token — and the substitution then applied to every occurrence in the
  // conversation, tool results included. None is EVER PII standalone. Name-doubling
  // acronyms stay out: "ui"/"ner" read as initials, and a 2-3 letter token is exactly what
  // the discipline warns about — an entry here ships that word in clear FOREVER.
  "mcp", "sse", "oauth", "oauth2", "sso", "saml", "grpc", "websocket", "websockets",
  "protocol", "protocols", "protocoles", "webhook", "webhooks", "payload", "payloads",
  "header", "headers", "en-tête", "en-têtes", "connector", "connectors", "connecteur",
  "connecteurs", "sql", "llm", "ocr", "cli", "uuid", "timestamp", "timestamps",
  "horodatage", "horodatages",
  // ⚠️ File EXTENSIONS (pdf/docx/xlsx/csv) are deliberately NOT here: the path faker
  // needs them as extensions, not as words to spare, and listing them broke the
  // same-kind filename fake (`paths.test.ts`). They are already handled where a path is.
]);
