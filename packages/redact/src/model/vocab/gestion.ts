/**
 * Vocabulary volume: **accounting, finance and management control** — the books, the
 * financial statements, markets, and the language of a budget review — FR/EN/DE/ES/IT/PT.
 * Discipline: `./index`.
 *
 * Why it exists: measured 7/13 on accounting and 6/9 on markets, and the misses are the
 * words a financial document repeats on every line — "trésorerie", "capitaux propres",
 * "EBITDA", "grand livre". Faked, they turn a balance sheet into a page of invented
 * companies while the one thing that mattered (an IBAN, a client's name) was already
 * protected by its own rule.
 *
 * ⚠️ Deliberately ABSENT: `courtier` and `corredor` (surnames — the admin volume already
 * excludes the Spanish one), bare `ledger` (a surname in EN; `general ledger` is listed
 * instead), `haber` (Spanish accounting "credit" AND a surname), `bilanz` is fine but
 * `soll` / `haben` are left to the stopword list as ordinary German verbs.
 */
export const GESTION_TERMS: string[] = [
  // ── Accounting & financial statements — French ─────────────────────────────
  "comptabilité", "comptabilite", "comptable", "expert-comptable",
  "commissaire aux comptes", "grand livre", "livre journal", "écriture",
  "ecriture", "écritures", "ecritures", "écriture comptable",
  "ecriture comptable", "débit", "debit", "crédit", "credit", "solde",
  // bare "frais": « Frais Revolut Business » read as a NAME manufactured the
  // word-for-word alias frais→<fake first name>, which then rewrote EVERY « Frais d'abonnement »
  // on the statement (log 01/08). The compound « note de frais » (pro.ts) isn't enough.
  "frais", "fee", "fees",
  "lettrage", "rapprochement bancaire", "balance", "balance générale",
  "balance generale", "compte de résultat", "compte de resultat",
  "état financier", "etat financier", "états financiers", "etats financiers",
  "annexe comptable", "liasse fiscale", "clôture", "cloture",
  // « TVA intracom » was becoming a COMPANY (« ARDENCO labs », seen 13/08) — « TVA » was
  // covered, not its qualifiers: the compound survived and an invoice's most
  // ordinary tax mention was going out redacted as an invented company.
  "intracommunautaire", "intracommunautaires", "intracom", "autoliquidation",
  "clôture annuelle", "cloture annuelle", "exercice comptable", "exercice clos",
  "à nouveau", "a nouveau", "plan comptable", "compte", "comptes", "sous-compte",
  "actif", "passif", "actif circulant", "actif immobilisé", "actif immobilise",
  "capitaux propres", "fonds propres", "immobilisation", "immobilisations",
  "amortissement", "amortissements", "dépréciation", "depreciation",
  "provision", "provisions", "stock", "stocks", "encours", "créances",
  "creances", "dettes", "dettes fournisseurs", "dettes financières",
  "dettes financieres", "emprunt", "échéancier", "echeancier",

  // ── Performance & steering — French ────────────────────────────────────────
  "chiffre d'affaires", "produits", "charges", "charges fixes",
  "charges variables", "achats", "ventes", "marge", "marge brute",
  "marge nette", "taux de marge", "excédent brut d'exploitation",
  "excedent brut d'exploitation", "ebitda", "ebit", "résultat", "resultat",
  "résultat net",
  "résultat d'exploitation", "resultat d'exploitation",
  "rentabilité", "rentabilite", "seuil de rentabilité", "seuil de rentabilite",
  "point mort", "trésorerie", "tresorerie", "flux de trésorerie",
  "flux de tresorerie", "besoin en fonds de roulement", "fonds de roulement",
  "liquidité", "liquidite", "solvabilité", "solvabilite", "endettement",
  "ratio", "ratios", "indicateur", "indicateurs", "tableau de bord",
  "reporting", "prévisionnel", "previsionnel", "prévision", "prevision",
  "budget prévisionnel", "budget previsionnel", "écart budgétaire",
  "ecart budgetaire", "écarts budgétaires", "ecarts budgetaires",
  "contrôle de gestion", "controle de gestion",
  "comptabilité analytique", "comptabilite analytique", "centre de coût",
  "centre de cout", "coût de revient", "cout de revient", "valorisation",
  "business plan", "plan de trésorerie", "plan de tresorerie",

  // ── Capital & markets — French ─────────────────────────────────────────────
  "capital", "capital social", "augmentation de capital", "actionnaire",
  "actionnaires", "associé", "associe", "part sociale", "parts sociales",
  "dividende", "dividendes", "filiale", "filiales", "holding", "participation",
  "consolidation", "comptes consolidés", "comptes consolides", "levée de fonds",
  "levee de fonds", "investisseur", "investisseurs", "apport", "cession",
  "acquisition", "fusion", "bourse", "cotation", "cours de bourse", "action",
  "actions", "obligation", "obligations", "titre", "titres", "portefeuille",
  "placement", "rendement", "volatilité", "volatilite", "capitalisation",
  "plus-value", "moins-value", "ordre de bourse", "séance", "seance",
  "indice boursier", "assurance-vie", "épargne", "epargne", "intérêts",
  "interets", "taux d'intérêt", "taux d'interet", "échéance", "echeance",

  // ── English ────────────────────────────────────────────────────────────────
  "accounting", "bookkeeping", "accountant", "auditor", "general ledger",
  "journal entry", "debit", "credit", "balance", "trial balance",
  "balance sheet", "income statement", "profit and loss", "cash flow statement",
  "financial statements", "notes to the accounts", "closing", "year-end",
  "fiscal year", "financial year", "chart of accounts", "assets", "liabilities",
  // Two TAX ACRONYMS, and only two — the ones a benchmark measured (personas outside
  // France, 16/08/2026): the NER was tagging them ORGANISATION, so « Compute the FICA
  // withholding » went out with an invented company name and the model answered off
  // target. They pass this file's discipline: these are names of an ACT or TAX, not
  // of a body or a person (rule 1), and they're 4 characters (rule 3). Nothing is
  // added preemptively: an acronym goes here once a measurement has seen it break.
  //
  // ⚠️ ACCEPTED RESIDUAL: the NER often proposes the COMPOUND (« SDLT band »), and
  // `isGenericCompound` requires that EVERY word be covered — « band » isn't. Tried
  // then REMOVED: « tax band »/« tax bracket » change nothing (the span isn't
  // that one), and bare « band » is too broad for a single measurement. The residual is
  // preferred over an allow-list entry whose cost is permanent.
  "fica", "sdlt",
  "current assets", "fixed assets", "equity", "shareholders equity",
  "depreciation", "amortization", "amortisation", "provision", "accrual",
  "inventory", "receivables", "payables", "reconciliation", "write-off",
  "revenue", "turnover", "cost of goods sold", "gross margin", "net margin",
  "operating income", "net income", "profit", "loss", "profitability",
  "break-even", "cash flow", "working capital", "liquidity", "solvency",
  "leverage", "burn rate", "runway", "forecast", "variance", "budgeting",
  "cost centre", "cost center", "unit economics", "valuation", "due diligence",
  "share capital", "shareholder", "dividend", "subsidiary", "consolidation",
  "funding round", "investor", "cap table", "stock market", "shares", "bonds",
  "securities", "portfolio", "yield", "volatility", "market capitalisation",
  "capital gain", "interest rate", "maturity",

  // ── Deutsch ────────────────────────────────────────────────────────────────
  "buchhaltung", "buchführung", "buchfuhrung", "buchhalter", "wirtschaftsprüfer",
  "wirtschaftsprufer", "hauptbuch", "buchung", "buchungssatz", "saldo",
  "kontenplan", "konto", "bilanz", "gewinn- und verlustrechnung", "anhang",
  "jahresabschluss", "geschäftsjahr", "geschaftsjahr", "abschlussstichtag",
  "aktiva", "passiva", "anlagevermögen", "anlagevermogen", "umlaufvermögen",
  "umlaufvermogen", "eigenkapital", "fremdkapital", "verbindlichkeiten",
  "forderungen", "rückstellung", "ruckstellung", "abschreibung", "vorräte",
  "vorrate", "umsatz", "erlöse", "erlose", "aufwand", "ertrag", "rohertrag",
  "gewinn", "verlust", "betriebsergebnis", "rentabilität", "rentabilitat",
  "liquidität", "liquiditat", "cashflow", "kennzahl", "kennzahlen",
  "planung", "prognose", "abweichung", "controlling", "kostenstelle",
  "bewertung", "stammkapital", "aktionär", "aktionar", "gesellschafter",
  "dividende", "tochtergesellschaft", "beteiligung", "kapitalerhöhung",
  "kapitalerhohung", "investor", "aktie", "aktien", "anleihe", "wertpapier",
  "depot", "rendite", "volatilität", "volatilitat", "zinssatz",

  // ── Español ────────────────────────────────────────────────────────────────
  "contabilidad", "contable", "auditor", "libro mayor", "libro diario",
  "asiento", "asiento contable", "saldo", "plan contable", "cuenta", "cuentas",
  "balance de situación", "balance de situacion", "cuenta de resultados",
  "pérdidas y ganancias", "perdidas y ganancias", "memoria", "cierre",
  "cierre contable", "ejercicio", "activo", "pasivo", "activo corriente",
  "inmovilizado", "patrimonio neto", "fondos propios", "amortización",
  "amortizacion", "provisión", "provision", "existencias", "deudores",
  "acreedores", "conciliación bancaria", "conciliacion bancaria",
  "facturación", "facturacion", "ingresos", "gastos", "coste", "margen",
  "margen bruto", "beneficio", "pérdida", "perdida", "resultado del ejercicio",
  "rentabilidad", "umbral de rentabilidad", "tesorería", "tesoreria",
  "flujo de caja", "circulante", "endeudamiento", "presupuesto", "previsión",
  "prevision", "desviación", "desviacion", "indicador", "cuadro de mando",
  "valoración", "valoracion", "capital social", "ampliación de capital",
  "ampliacion de capital", "accionista", "socio", "dividendo", "filial",
  "participación", "participacion", "inversor", "ronda de financiación",
  "ronda de financiacion", "bolsa", "acción", "accion", "acciones", "bono",
  "valores", "cartera", "rentabilidad financiera", "volatilidad", "plusvalía",
  "plusvalia", "tipo de interés", "tipo de interes", "vencimiento",

  // ── Italiano ───────────────────────────────────────────────────────────────
  "contabilità", "contabilita", "commercialista", "revisore", "libro mastro",
  "libro giornale", "scrittura contabile", "saldo", "piano dei conti", "conto",
  "stato patrimoniale", "conto economico", "nota integrativa", "bilancio",
  "bilancio d'esercizio", "chiusura", "esercizio", "attivo", "passivo",
  "immobilizzazioni", "patrimonio netto", "ammortamento", "accantonamento",
  "rimanenze", "crediti", "debiti", "riconciliazione", "fatturato", "ricavi",
  "costi", "margine", "margine lordo", "utile", "perdita", "risultato",
  "redditività", "redditivita", "punto di pareggio", "liquidità", "liquidita",
  "flusso di cassa", "capitale circolante", "indebitamento", "budget",
  "previsione", "scostamento", "indicatore", "cruscotto", "valutazione",
  "capitale sociale", "aumento di capitale", "azionista", "socio", "dividendo",
  "controllata", "partecipazione", "investitore", "borsa", "azione", "azioni",
  "obbligazione", "titoli", "portafoglio", "rendimento", "volatilità",
  "volatilita", "plusvalenza", "tasso di interesse", "scadenza",

  // ── Português ──────────────────────────────────────────────────────────────
  "contabilidade", "contabilista", "contador", "auditor", "livro razão",
  "livro razao", "livro diário", "livro diario", "lançamento", "lancamento",
  "saldo", "plano de contas", "conta", "contas", "balanço", "balanco",
  "demonstração de resultados", "demonstracao de resultados", "encerramento",
  "exercício", "exercicio", "ativo", "passivo", "imobilizado",
  "património líquido", "patrimonio liquido", "capital próprio",
  "capital proprio", "amortização", "amortizacao", "depreciação",
  "depreciacao", "provisão", "provisao", "existências", "existencias",
  "estoque", "contas a receber", "contas a pagar", "reconciliação",
  "reconciliacao", "faturação", "faturacao", "faturamento", "receitas",
  "despesas", "custo", "margem", "margem bruta", "lucro", "prejuízo",
  "prejuizo", "resultado líquido", "resultado liquido", "rentabilidade",
  "ponto de equilíbrio", "ponto de equilibrio", "tesouraria", "fluxo de caixa",
  "fundo de maneio", "endividamento", "orçamento", "orcamento", "previsão",
  "previsao", "desvio", "indicador", "painel de controlo", "avaliação",
  "avaliacao", "capital social", "aumento de capital", "acionista", "sócio",
  "socio", "dividendo", "subsidiária", "subsidiaria", "participação",
  "participacao", "investidor", "bolsa", "ação", "acoes", "ações", "obrigação",
  "obrigacao", "títulos", "titulos", "carteira", "rendibilidade",
  "volatilidade", "mais-valia", "taxa de juro", "vencimento",
];
