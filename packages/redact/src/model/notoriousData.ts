/**
 * The DATA of the notoriety dispensation — the curated lists only; the predicate and the
 * category scoping live in `./notorious.ts`, which is the ONLY reader. Split by theme
 * (data / logic) for the 300-LOC rule; same file family, same discipline:
 *
 * ⚠️ These are ALLOW-lists (a value here ships to the model in clear), so a wrong entry
 * is a PERMANENT leak for that word — see `./notorious.ts` for the full rules
 * (category-scoped, unambiguous entries only, `forced`/org-mandated outrank).
 */
import { BRAND } from "@openmasq/branding";

// ── Famous PEOPLE (category "name") ─────────────────────────────────────────────
// Full names, plus mononyms with no plausible life as a private individual's name.
export const PEOPLE = [
  // Science
  "Albert Einstein", "Einstein", "Isaac Newton", "Marie Curie", "Pierre Curie",
  "Charles Darwin", "Darwin", "Galileo Galilei", "Galilée", "Louis Pasteur",
  "Nikola Tesla", "Thomas Edison", "Stephen Hawking", "Alan Turing", "Ada Lovelace",
  "Sigmund Freud", "Freud", "Archimède", "Archimedes", "Pythagore", "Pythagoras",
  // History & thought
  "Napoléon", "Napoléon Bonaparte", "Jules César", "Julius Caesar", "Cléopâtre",
  "Cleopatra", "Jeanne d'Arc", "Louis XIV", "Charlemagne", "Christophe Colomb",
  "Christopher Columbus", "Charles de Gaulle", "de Gaulle", "Winston Churchill",
  "Churchill", "Abraham Lincoln", "George Washington", "Mahatma Gandhi", "Gandhi",
  "Nelson Mandela", "Mandela", "Martin Luther King", "Platon", "Plato", "Aristote",
  "Aristotle", "Socrate", "Socrates", "Voltaire", "Descartes", "René Descartes",
  // Arts
  "Léonard de Vinci", "Leonardo da Vinci", "Michel-Ange", "Michelangelo",
  "Pablo Picasso", "Picasso", "Vincent van Gogh", "van Gogh", "Claude Monet",
  "Rembrandt", "Salvador Dalí", "Frida Kahlo", "Mozart", "Wolfgang Amadeus Mozart",
  "Beethoven", "Ludwig van Beethoven", "Jean-Sébastien Bach", "Chopin", "Vivaldi",
  "William Shakespeare", "Shakespeare", "Molière", "Victor Hugo", "Marcel Proust",
  "Albert Camus", "Ernest Hemingway", "Agatha Christie", "J.K. Rowling",
  // Politics (current era)
  "Emmanuel Macron", "Macron", "Brigitte Macron", "François Hollande",
  "Nicolas Sarkozy", "Sarkozy", "Jacques Chirac", "Chirac", "François Mitterrand",
  // ⚠️ The NER often emits the SURNAME alone ("l'administration Trump" → span "Trump"),
  // so a figure needs the standalone form too — "Donald Trump" alone left "Trump" faked
  // on Le Monde's front page. Standalones stay allow-list-curated: unambiguous only.
  "Mitterrand", "Donald Trump", "Trump", "Joe Biden", "Barack Obama", "Obama",
  "Hillary Clinton", "Bill Clinton", "Kamala Harris", "Vladimir Poutine",
  "Christine Lagarde", "Lagarde", "Marine Le Pen", "Le Pen", "Jean-Luc Mélenchon",
  "Mélenchon", "Édouard Philippe", "Gabriel Attal", "François Bayrou", "Bayrou",
  "Vladimir Putin", "Xi Jinping", "Angela Merkel", "Merkel", "Olaf Scholz",
  "Giorgia Meloni", "Keir Starmer", "Justin Trudeau", "Volodymyr Zelensky",
  "Zelensky", "Benjamin Netanyahou", "Benjamin Netanyahu", "Narendra Modi",
  "Ursula von der Leyen", "Elizabeth II", "Charles III",
  // Business & tech
  "Elon Musk", "Bill Gates", "Steve Jobs", "Steve Wozniak", "Jeff Bezos",
  "Mark Zuckerberg", "Zuckerberg", "Warren Buffett", "Tim Cook", "Satya Nadella",
  "Sundar Pichai", "Sam Altman", "Dario Amodei", "Demis Hassabis", "Jensen Huang",
  "Larry Page", "Sergey Brin", "Jack Ma", "Bernard Arnault", "Xavier Niel",
  // Sport & culture
  "Cristiano Ronaldo", "Lionel Messi", "Messi", "Kylian Mbappé", "Mbappé",
  "Zinédine Zidane", "Zidane", "Antoine Griezmann", "Novak Djokovic", "Rafael Nadal",
  "Roger Federer", "Serena Williams", "Usain Bolt", "Michael Jordan", "LeBron James",
  "Taylor Swift", "Beyoncé", "Rihanna", "Madonna", "Michael Jackson", "Elvis Presley",
  "Freddie Mercury", "David Bowie", "Céline Dion", "Édith Piaf", "Johnny Hallyday",
];

/** The dispensation's PERSONALITIES — exported for display on the app side (same rule
 *  as above: the list has only one home). Dispensed by DEFAULT (redacting
 *  « Albert Einstein » makes the model reason about nobody) — except `people: false`,
 *  the opt-out the Strict level passes (product decision 30/07/2026). */
export const NOTORIOUS_PEOPLE: readonly string[] = PEOPLE;

// ── Famous ORGS / brands / finance (category "company") ─────────────────────────
/**
 * ⚠️ COMMERCIAL BRANDS — CONDITIONAL dispensation (`commercial` opt-in), never again
 * unconditional (product decision, 27/07/2026; reopened BY LEVEL on 30/07/2026).
 *
 * Why the removal: « Google » is public knowledge, but in « I work
 * at Google », « the BNP Paribas file is progressing » or « the Airbus invoice is
 * late », the entity isn't general knowledge — it's the writer's employer, client,
 * or supplier. A manual bench of 100 prompts turned up twenty of
 * these sentences.
 *
 * Why it came back, and under what conditions: the Standard and Enhanced levels
 * pass `commercial: true` (the app decides, see `@openmasq/ui` `privacy/privacyLevel.ts`)
 * — the brand then goes out in clear EXCEPT when the text ties it to the writer
 * (`isSelfBoundEntity`, the gate that answers exactly the bench above). Strict
 * mode doesn't pass the flag: the brand stays redacted there. Always category-scoped:
 * an individual named Hermès/Tesla/Leclerc (NAME) stays protected regardless of the flag.
 *
 * What stays dispensed WITHOUT the flag: public and administrative bodies (Pôle
 * emploi, Assurance Maladie, CADA…), mail senders (mutual insurers,
 * Sacem), the technical tooling a post-mortem cites, ubiquitous products,
 * indices and fund issuers, countries and public figures. None of these is a business
 * relationship of the user.
 */
export const COMMERCIAL_ORGS = [
  // Tech
  "Apple", "Google", "Alphabet", "Microsoft", "Amazon", "Meta", "Facebook",
  "Instagram", "WhatsApp", "Netflix", "Tesla", "SpaceX", "OpenAI", "Anthropic",
  // bare "Mistral" is OMITTED (a common noun — the wind — and a plausible private
  // project codename); only the unambiguous full form is spared.
  "Mistral AI", "Nvidia", "Intel", "AMD", "IBM", "Oracle", "Samsung",
  "Sony", "Nintendo", "Twitter", "TikTok", "YouTube", "LinkedIn", "Reddit",
  "Wikipedia", "Wikipédia", "Spotify", "Uber", "Airbnb", "PayPal", "Stripe",
  "Salesforce", "Adobe", "Qualcomm", "Broadcom", "TSMC", "ASML", "Alibaba",
  "Tencent", "Huawei", "Xiaomi", "Zoom", "Slack", "Notion", "GitHub", "GitLab",
  // Industry & consumer
  "Toyota", "Volkswagen", "BMW", "Mercedes", "Mercedes-Benz", "Renault", "Peugeot",
  "Citroën", "Stellantis", "Ferrari", "Porsche", "Airbus", "Boeing", "TotalEnergies",
  "LVMH", "L'Oréal", "Danone", "Nestlé", "Carrefour", "Auchan", "Leclerc", "Orange",
  "Bouygues", "Vinci", "SNCF", "RATP", "EDF", "Engie", "Air France", "Sanofi",
  "Pfizer", "Moderna", "AstraZeneca", "Michelin", "Decathlon", "Ikea", "McDonald's",
  // French e-commerce: the brand appears on a bank statement or an invoice as the
  // SUPPLIER, never as the reader's identity. Measured: missing from the list, it
  // went out as « Voxa Labs » in the same message where MAIF, itself, stayed in clear — two
  // notorious brands, two treatments, in the same message.
  "Cdiscount",
  "Starbucks", "Coca-Cola", "Pepsi", "Nike", "Adidas", "Zara", "H&M", "Rolex",
  "Chanel", "Dior", "Hermès", "Gucci", "ExxonMobil", "Shell", "BP", "Aramco",
  // Banking & finance
  "BNP Paribas", "BNP", "Société Générale", "Crédit Agricole", "Crédit Mutuel",
  "Banque Postale", "Boursorama", "Revolut", "N26", "AXA", "Allianz", "Visa",
  "Mastercard", "Goldman Sachs", "JPMorgan", "JP Morgan", "Morgan Stanley", "HSBC",
  "Deutsche Bank", "UBS", "Barclays", "Citigroup", "Berkshire Hathaway",
  // ── App's MCP integrations ──────────────────────────────────────────────
  // EVERY brand in the connector catalog (`@openmasq/catalog` mcp/connectors)
  // must be here — product request from 30/07/2026: dispensed outside Strict, redacted
  // in Strict. That's why they live in the COMMERCIAL block (conditional) and
  // NOT in ORGS (unconditional) — a connector brand left in ORGS would be
  // spared in Strict. Pinned by the app-side parity test
  // (`packages/ui/src/privacy/notorietyCatalogParity.test.ts` — it reads the catalog,
  // the two packages being unable to import each other, rule 9). The name of a
  // CONNECTED connector otherwise stays in clear at every level via `keep` (routing).
  "Gmail", "Google Agenda", "Google Calendar", "Google Drive", "Google Docs",
  "Google Sheets", "Google Tasks", "Google Analytics",
  "Outlook", "OneDrive", "SharePoint", "Microsoft Teams",
  "Canva", "Dropbox", "Airtable", "Asana", "Linear", "Atlassian", "Superhuman",
  "monday.com", "Jotform", "Fireflies", "Intercom", "Close", "Attio",
  "Square", "Morningstar", "Vantage",
  "Exa", "Tavily", "Firecrawl", "Apify", "Bright Data",
  "Sentry", "Vercel", "Netlify", "Cloudflare", "Supabase", "Neon",
  "Prisma", "Prisma Postgres", "Semgrep", "Zapier", "Amplitude", "PostHog",
  "Hugging Face", "Cloudinary", "Wix", "Webflow", "WebsitePublisher.ai", "Synapse",
  // Transactional mail senders observed redacted in real user journeys
  // (the model was reasoning about invented brokers and services). Same rules:
  // company-scoped, plain words just like « Close »/« Square »/« Vantage ».
  "Interactive Brokers", "Consensus", "Alpaca", "Alpaca Markets", "Daz", "Daz 3D",
  "Electro Dépôt",
];

/** The commercial BRANDS of the conditional dispensation — exported so the app
 *  (the per-LEVEL policy in `@openmasq/ui` `privacy/privacyLevel.ts`) can show
 *  the list without copying it (rule 9: one home only). The POLICY (which level
 *  passes `commercial: true`) lives on the app side; the LIST and its discipline live here. */
export const NOTORIOUS_COMMERCIAL_ORGS: readonly string[] = COMMERCIAL_ORGS;

export const ORGS = [
  // Hosting providers: French law requires NAMING the host in legal notices/T&Cs,
  // so they appear in a document by obligation, never as the user's
  // data. Faked, the model answers about a hosting provider that doesn't exist.
  // ⚠️ « Cloudflare » is REMOVED from here: it's an app MCP connector, so it lives
  // in the COMMERCIAL block (conditional dispensation — redacted in Strict).
  "OVH", "OVHcloud", "Scaleway",
  // Providers and tools that EVERY technical conversation names — a post-mortem, an
  // audit or a runbook cites them like a contract cites its host. Category-SCOPED,
  // and why they're here rather than in `vocab/tech.ts`.
  // ⚠️ A tool that is ALSO an app MCP connector (Sentry, Vercel, Netlify,
  // Supabase, Atlassian, Asana, Linear, GitHub, Stripe, Slack, Notion, Outlook,
  // OneDrive, SharePoint, Morningstar…) is NOT here: it lives in the COMMERCIAL block,
  // so Strict redacts it (parity pinned by `notorietyCatalogParity.test.ts`).
  "AWS", "Amazon Web Services", "Amazon S3", "Amazon EC2", "Azure", "Microsoft Azure",
  "Google Cloud", "Google Cloud Platform", "GCP", "DigitalOcean", "Heroku",
  "Fly.io", "Render", "Firebase", "Datadog", "Grafana",
  "Prometheus", "New Relic", "PagerDuty", "Elastic", "Kibana", "Splunk",
  "Jira", "Confluence", "Figma", "Miro", "Trello",
  "Docker Hub", "npm", "PyPI", "Maven Central", "Terraform Cloud", "HashiCorp", "HashiCorp Vault", "Vault", "Argo CD", "PgBouncer",
  "Postman", "Sonar", "SonarQube", "Snyk", "Dependabot", "Renovate",
  // Repatriated from the removed commercial block: in a post-mortem or a runbook these
  // are TOOLS the document cites, never someone's employer.
  "GitLab", "Zoom", "Salesforce",
  // Ubiquitous PRODUCTS a NER tags as orgs ("dans Excel", "sur iPhone"). Company-
  // scoped like every entry here, so "Claude"/"Gemini" the FIRST NAMES stay protected
  // under the "name" category — only the product reading is spared.
  "Excel", "PowerPoint", "Windows", "macOS",
  "iOS", "iPhone", "iPad", "MacBook", "Android", "Chrome", "Firefox", "Safari",
  "ChatGPT", "Copilot", "Gemini", "Claude", "DeepSeek", "Perplexity",
  // The AI TOOLS the app cites itself (Settings: « Model on your
  // computer » names Ollama and LM Studio) + the app. VERSIONED MODEL names
  // (« GPT-5.5 », « Claude Sonnet 4.6 ») go through the `modelNames.ts` grammar,
  // not through this list — it could never keep up with a living catalog.
  "Ollama", "LM Studio", "OpenRouter", "Cursor", "VS Code", "Claude Code",
  "Midjourney", BRAND.name,
  // Model FAMILIES in a single word — TOOL NAMES the app cites
  // constantly (« compare Opus and Sonnet »). Deliberately HERE, and not in the shape
  // grammar: this list is SCOPED BY CATEGORY, so « Opus » the tool (company) is dispensed
  // while « Opus »/« Gemma »/« Kimi » the FIRST NAME (name) stays protected — a bare word
  // is never dispensed under « name » (`notorious.ts`). This is what makes the move safe
  // where the grammar, blind to category, was leaking « Claude » the first name.
  // ACCEPTED residual: « la société Opus » goes out in clear — it's a tool name for the app,
  // and being able to talk about it wins out (product decision 13/08).
  "Opus", "Sonnet", "Haiku", "Gemma", "Kimi", "Grok", "Llama", "Qwen", "Le Chat",
  // French retail banks + insurers, incl. the mutual/bancassurance subsidiaries whose
  // names paper an insurance letter (PACIFICA, PREDICA, CAMCA…). They are the SENDER's
  // masthead, never the reader's identity, and faking them to invented companies made
  // the model reason about a letter from nobody. Company-scoped like every entry here.
  "Banque Populaire", "Caisse d'Épargne", "Caisse d'Epargne", "LCL", "CIC", "HSBC",
  "Crédit Logement", "Crédit Foncier", "Cetelem", "Sofinco", "Cofidis", "Oney",
  "Pacifica", "Predica", "Camca", "CNP Assurances", "Groupama", "Generali",
  "MAIF", "MACIF", "MAAF", "Matmut", "GMF", "MMA", "Swiss Life", "Harmonie Mutuelle",
  "Malakoff Humanis", "AG2R La Mondiale", "Klesia", "Apicil", "Aésio", "Aesio",
  // Collective-rights societies — the SENDER of a royalties statement (« rendez-vous
  // sur SACEM.FR »), never the reader's identity. Faked, the model told the user to
  // visit an invented society's site. Unambiguous acronym; company-scoped as always.
  "Sacem",
  // Major European retail banks / insurers / public bodies — the same "sender's
  // masthead" logic, per country. Ambiguous bare words keep their FULL form only
  // ("Banco Santander", "Zurich Insurance" — Santander and Zurich are CITIES, and a
  // city is personal location data; "Nationwide" is a common English word).
  "Commerzbank", "ERGO", "HUK-Coburg", "Debeka", "Signal Iduna", "Techniker Krankenkasse",
  "AOK", "Barmer", "Bundesagentur für Arbeit",
  "Lloyds Bank", "NatWest", "Aviva", "Prudential", "Legal & General", "Bupa",
  "Standard Life", "Scottish Widows",
  "Banco Santander", "BBVA", "CaixaBank", "Banco Sabadell", "Bankinter", "Mapfre",
  "Agencia Tributaria",
  "Intesa Sanpaolo", "UniCredit", "Poste Italiane", "Agenzia delle Entrate",
  "Caixa Geral de Depósitos", "Caixa Geral de Depositos", "Millennium BCP",
  "Novo Banco", "Fidelidade",
  "ING", "Rabobank", "ABN AMRO", "Achmea", "Aegon", "Belastingdienst",
  "KBC", "Belfius", "BNP Paribas Fortis",
  "Credit Suisse", "Zurich Insurance", "Swiss Re", "PostFinance", "Raiffeisen",
  "PKO Bank Polski", "PZU", "mBank",
  "Nordea", "Danske Bank", "DNB", "Swedbank", "Handelsbanken",
  "Euronext", "Nasdaq", "NYSE", "Bloomberg", "Reuters", "Moody's", "Fitch",
  "Yahoo", "Yahoo Finance", "Google Finance", "TradingView",
  // Fund issuers & asset managers (see ORG_PREFIXES for their PRODUCT names)
  "Vanguard", "BlackRock", "iShares", "Invesco", "Fidelity", "State Street", "SPDR",
  "VanEck", "Direxion", "ProShares", "WisdomTree", "ARK Invest", "Amundi", "Lyxor",
  "Xtrackers", "Charles Schwab", "Franklin Templeton", "PIMCO", "T. Rowe Price",
  // Indices (a NER routinely tags them ORG)
  "S&P 500", "S&P", "Nasdaq 100", "Dow Jones", "CAC 40", "CAC40", "DAX", "FTSE 100",
  "FTSE", "Euro Stoxx 50", "Euro Stoxx", "Russell 2000", "Nikkei 225", "Nikkei",
  "MSCI", "MSCI World",
  // Institutions
  "ONU", "UNESCO", "OTAN", "NATO", "FMI", "IMF", "OMS", "WHO", "NASA", "ESA",
  "Union Européenne", "European Union", "Banque Centrale Européenne", "BCE", "ECB",
  "Federal Reserve", "Croix-Rouge", "Interpol", "Europol",
  // French state metonyms — an "org" span in press prose ("Matignon négocie…"), never
  // someone's data. Faking "Matignon" to a person name inverted a front-page story's
  // meaning (the reported news-summary distortion).
  "Matignon", "Élysée", "Elysée", "Bercy", "Quai d'Orsay", "Assemblée nationale", "Sénat",
  // French public social/administrative bodies — the counterparty of every benefit,
  // pension or health letter. Public institutions, not the user's data. (Their
  // acronyms — CPAM, CAF, CDAPH, MDPH… — are common-vocabulary entries instead, in
  // `vocab/admin.ts`, because they read as a KIND of body.)
  "France Travail", "Pôle emploi", "Pole emploi", "Assurance Maladie", "Ameli",
  "Caisse des Dépôts", "Caisse des Depots", "Banque de France", "Service Public",
  // Independent administrative authorities, named in the footer of the letters that
  // mention a right of appeal — the body, never the reader.
  "CADA", "Commission d'Accès aux Documents Administratifs",
  "Commission d'Acces aux Documents Administratifs", "CNIL", "Défenseur des droits",
  "Defenseur des droits",
  // Registry/filing portals — the MASTHEAD of every K-bis / company extract, never the
  // reader's identity (their common-noun siblings "greffe"/"inpi"/"bodacc" live in the
  // generic volume; these are proper NAMES, so they belong here, category-scoped).
  "Infogreffe", "Legifrance", "Légifrance",
  // World-famous academic institutions — an expert-bio line ("Professeure à Columbia
  // University") reads as world knowledge; faking the university makes the credential
  // meaningless. Curated to the unambiguous, globally-known few — never a generic
  // "université de X" (someone's actual employer stays redactable).
  "Sciences Po", "Sciences-Po", "Columbia University", "Harvard", "Harvard University",
  "MIT", "Stanford", "Stanford University", "Oxford University", "Cambridge University",
  "Sorbonne", "La Sorbonne", "Polytechnique", "École Polytechnique", "HEC", "ENA",
];

// Major TICKERS (a NER tags them ORG; an agent needs them verbatim to query markets).
// Curated to the mega-liquid ETFs / megacaps — 2 letters minimum, no dictionary word.
export const TICKERS = [
  "SPY", "VOO", "IVV", "VTI", "QQQ", "QQQM", "IWM", "DIA", "EFA", "EEM", "VEA",
  "VWO", "AGG", "BND", "TLT", "LQD", "HYG", "GLD", "SLV", "USO", "UNG", "DBC",
  "XLE", "XLF", "XLK", "XLV", "XLI", "XLP", "XLY", "XLU", "XLB", "XLC", "XLRE",
  "IAU", "GDX", "GDXJ", "PPLT", "PALL", "CPER", "WEAT", "CORN", "URA", "LIT",
  "SOXX", "SMH", "PSI", "SOXL", "SOXS", "TQQQ", "SQQQ", "LABU", "LABD", "XBI",
  "IBB", "OIH", "XOP", "VDE", "VNQ", "SCHD", "JEPI", "VIG", "VYM", "ARKK", "VGT",
  "MDY", "RSP", "IWF", "IWD", "VUG", "VTV", "EWJ", "EWZ", "FXI", "MCHI", "INDA",
  "KWEB", "KRE", "ITB", "XHB",
  "AAPL", "MSFT", "GOOGL", "GOOG", "AMZN", "META", "NVDA", "TSLA", "AVGO", "AMD",
  "INTC", "NFLX", "ORCL", "CRM", "ADBE", "QCOM", "TXN", "MU", "TSM", "BABA",
];

// Fund-issuer PREFIXES: an issuer's PRODUCT name ("Invesco Semiconductors ETF",
// "United States Oil Fund", "Direxion Daily S&P Biotech Bull") is public too, but its
// full value never equals a set entry — so a COMPANY candidate whose first word(s) are
// a famous issuer is spared as a whole. Issuers ONLY (their brand owns the namespace);
// never generic brands ("Apple Consulting SARL" must stay redactable).
export const ORG_PREFIXES = new Set(
  [
    "Vanguard", "BlackRock", "iShares", "Invesco", "Fidelity", "SPDR", "VanEck",
    "Direxion", "ProShares", "WisdomTree", "Xtrackers", "Lyxor", "Amundi",
    "State Street", "Global X", "First Trust", "United States",
  ].map((s) => s.toLowerCase()),
);
