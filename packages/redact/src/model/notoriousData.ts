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

/** Les PERSONNALITÉS de la dispense — exportées pour l'affichage côté app (même règle
 *  qu'au-dessus : la liste n'a qu'une maison). Dispensées par DÉFAUT (redact
 *  « Albert Einstein » fait raisonner le modèle sur personne) — sauf `people: false`,
 *  l'opt-out que le niveau Strict passe (décision produit 30/07/2026). */
export const NOTORIOUS_PEOPLE: readonly string[] = PEOPLE;

// ── Famous ORGS / brands / finance (category "company") ─────────────────────────
/**
 * ⚠️ MARQUES COMMERCIALES — dispense CONDITIONNELLE (`commercial` opt-in), plus jamais
 * inconditionnelle (décision produit, 27/07/2026 ; ré-ouverte par NIVEAU le 30/07/2026).
 *
 * Pourquoi le retrait : « Google » est de notoriété publique, mais dans « je travaille
 * chez Google », « le dossier BNP Paribas avance » ou « la facture d'Airbus est en
 * retard », l'entité n'est pas une connaissance générale — c'est l'employeur, le client
 * ou le fournisseur de celui qui écrit. Un bench manuel de 100 prompts a relevé vingt de
 * ces phrases.
 *
 * Pourquoi le retour, et sous quelles conditions : les niveaux Standard et Renforcé
 * passent `commercial: true` (l'app décide, voir `@openmasq/ui` `privacy/privacyLevel.ts`)
 * — la marque part alors en clair SAUF quand le texte la rattache à celui qui écrit
 * (`isSelfBoundEntity`, la porte qui répond exactement au bench ci-dessus). Le mode
 * Strict ne passe pas le flag : la marque y reste redacted. Toujours category-scoped :
 * un particulier nommé Hermès/Tesla/Leclerc (NAME) reste protégé quel que soit le flag.
 *
 * Ce qui reste dispensé SANS flag : les organismes publics et administratifs (Pôle
 * emploi, Assurance Maladie, CADA…), les émetteurs de courrier (assureurs mutualistes,
 * Sacem), l'outillage technique qu'un post-mortem cite, les produits ubiquitaires, les
 * indices et émetteurs de fonds, les pays et les personnalités. Aucun n'est une relation
 * d'affaires de l'utilisateur.
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
  // E-commerce FR : la marque paraît sur un relevé bancaire ou une facture comme
  // FOURNISSEUR, jamais comme l'identité du lecteur. Mesuré : faute d'y figurer, elle
  // partait en « Voxa Labs » dans le même envoi où MAIF, elle, restait en clair — deux
  // marques notoires, deux traitements, dans le même message.
  "Cdiscount",
  "Starbucks", "Coca-Cola", "Pepsi", "Nike", "Adidas", "Zara", "H&M", "Rolex",
  "Chanel", "Dior", "Hermès", "Gucci", "ExxonMobil", "Shell", "BP", "Aramco",
  // Banking & finance
  "BNP Paribas", "BNP", "Société Générale", "Crédit Agricole", "Crédit Mutuel",
  "Banque Postale", "Boursorama", "Revolut", "N26", "AXA", "Allianz", "Visa",
  "Mastercard", "Goldman Sachs", "JPMorgan", "JP Morgan", "Morgan Stanley", "HSBC",
  "Deutsche Bank", "UBS", "Barclays", "Citigroup", "Berkshire Hathaway",
  // ── Intégrations MCP de l'app ──────────────────────────────────────────────
  // CHAQUE marque du catalogue de connecteurs (`@openmasq/catalog` mcp/connectors)
  // doit être ici — demande produit du 30/07/2026 : dispensée hors Strict, redacted
  // en Strict. C'est pourquoi elles vivent dans le bloc COMMERCIAL (conditionnel) et
  // PAS dans ORGS (inconditionnel) — une marque-connecteur laissée dans ORGS serait
  // épargnée en Strict. Épinglé par le test de parité côté app
  // (`packages/ui/src/privacy/notorietyCatalogParity.test.ts` — il lit le catalogue,
  // les deux packages ne pouvant pas s'importer, règle 9). Le nom d'un connecteur
  // CONNECTÉ reste par ailleurs en clair à tous les niveaux via `keep` (routage).
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
];

/** Les MARQUES commerciales de la dispense conditionnelle — exportées pour que l'app
 *  (la politique par NIVEAU de `@openmasq/ui` `privacy/privacyLevel.ts`) puisse montrer
 *  la liste sans la recopier (règle 9 : une seule maison). La POLITIQUE (quel niveau
 *  passe `commercial: true`) vit côté app ; la LISTE et sa discipline vivent ici. */
export const NOTORIOUS_COMMERCIAL_ORGS: readonly string[] = COMMERCIAL_ORGS;

export const ORGS = [
  // Hébergeurs : la loi française impose de NOMMER l'hébergeur dans les mentions
  // légales/CGV, donc ils arrivent dans un document par obligation, jamais comme une
  // donnée de l'utilisateur. Faké, le modèle répond sur un hébergeur inexistant.
  // ⚠️ « Cloudflare » est SORTI d'ici : c'est un connecteur MCP de l'app, donc il vit
  // dans le bloc COMMERCIAL (dispense conditionnelle — redacted en Strict).
  "OVH", "OVHcloud", "Scaleway",
  // Fournisseurs et outils que TOUTE conversation technique nomme — un post-mortem, un
  // audit ou un runbook les cite comme le contrat cite son hébergeur. Category-SCOPED,
  // et pourquoi ils sont ici plutôt que dans `vocab/tech.ts`.
  // ⚠️ Un outil qui est AUSSI un connecteur MCP de l'app (Sentry, Vercel, Netlify,
  // Supabase, Atlassian, Asana, Linear, GitHub, Stripe, Slack, Notion, Outlook,
  // OneDrive, SharePoint, Morningstar…) N'EST PAS ici : il vit dans le bloc COMMERCIAL,
  // pour que Strict le redacted (parité épinglée par `notorietyCatalogParity.test.ts`).
  "AWS", "Amazon Web Services", "Amazon S3", "Amazon EC2", "Azure", "Microsoft Azure",
  "Google Cloud", "Google Cloud Platform", "GCP", "DigitalOcean", "Heroku",
  "Fly.io", "Render", "Firebase", "Datadog", "Grafana",
  "Prometheus", "New Relic", "PagerDuty", "Elastic", "Kibana", "Splunk",
  "Jira", "Confluence", "Figma", "Miro", "Trello",
  "Docker Hub", "npm", "PyPI", "Maven Central", "Terraform Cloud", "HashiCorp", "HashiCorp Vault", "Vault", "Argo CD", "PgBouncer",
  "Postman", "Sonar", "SonarQube", "Snyk", "Dependabot", "Renovate",
  // Rapatriés du bloc commercial retiré : dans un post-mortem ou un runbook ce sont
  // des OUTILS que le document cite, jamais l'employeur de quelqu'un.
  "GitLab", "Zoom", "Salesforce",
  // Ubiquitous PRODUCTS a NER tags as orgs ("dans Excel", "sur iPhone"). Company-
  // scoped like every entry here, so "Claude"/"Gemini" the FIRST NAMES stay protected
  // under the "name" category — only the product reading is spared.
  "Excel", "PowerPoint", "Windows", "macOS",
  "iOS", "iPhone", "iPad", "MacBook", "Android", "Chrome", "Firefox", "Safari",
  "ChatGPT", "Copilot", "Gemini", "Claude", "DeepSeek", "Perplexity",
  // Les OUTILS d'IA que l'app cite elle-même (Réglages : « Modèle sur votre
  // ordinateur » nomme Ollama et LM Studio) + l'app. Les noms de MODÈLES versionnés
  // (« GPT-5.5 », « Claude Sonnet 4.6 ») passent par la grammaire `modelNames.ts`,
  // pas par cette liste — elle ne suivrait jamais un catalogue vivant.
  "Ollama", "LM Studio", "OpenRouter", "Cursor", "VS Code", "Claude Code",
  "Midjourney", BRAND.name,
  // Les FAMILLES de modèles en un seul mot — des NOMS D'OUTILS que l'app cite sans
  // arrêt (« compare Opus et Sonnet »). Ici EXPRÈS, et pas dans la grammaire de forme :
  // cette liste est SCOPÉE PAR CATÉGORIE, donc « Opus » l'outil (company) est dispensé
  // tandis que « Opus »/« Gemma »/« Kimi » le PRÉNOM (name) reste protégé — un mot nu
  // n'est jamais dispensé sous « name » (`notorious.ts`). C'est ce qui rend le geste sûr
  // là où la grammaire, insensible à la catégorie, faisait fuir « Claude » le prénom.
  // Résidu ASSUMÉ : « la société Opus » part en clair — c'est un nom d'outil pour l'app,
  // et pouvoir en parler prime (décision produit 13/08).
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
