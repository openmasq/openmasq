/**
 * GENERIC_TERMS, fourth volume: the **technical vocabulary** — languages, runtimes,
 * frameworks, databases, infrastructure, observability, protocols, file formats and the
 * compliance frameworks that fill an audit. Folded into `GENERIC_TERMS` by
 * `genericTermsData.ts` (one flat Set, O(1) lookups).
 *
 * Why it exists: a stack trace, a `docker-compose`, a post-mortem or a security audit is
 * DENSE with these words, and the NER tags them ORG by the dozen. Measured before this
 * volume: 4/15 of the most common tooling words covered, 1/8 of the cloud ones, 2/8 of the
 * compliance frameworks — each miss faked into an invented company, so the model answered
 * about a system that does not exist ("migrate [Voxa Group] to [Oslen SAS]").
 *
 * ⚠️ Same allow-list discipline as the other volumes — a wrong entry ships that word in
 * clear FOREVER:
 * - **kind-of-thing words only.** A specific vendor's proper NAME (Datadog, Vercel,
 *   Cloudflare) belongs in `notorious.ts`, category-SCOPED, not here: spared here it would
 *   also be spared as a person's surname.
 * - **never a word that doubles as a first name or surname** — deliberately ABSENT:
 *   `ruby`, `swift`, `rust`, `django`, `ada`, `julia`, `crystal`, `pascal`, `jenkins`,
 *   `travis`, `hudson`, `sentry` (a surname in EN), `kafka` (a person), `tesla`, `nova`,
 *   `iris`, `sierra`, `phoenix`. The engine's own homograph guard covers the recall side;
 *   what it cannot undo is a leak.
 * - **never a bare letter or 1-2 char token** (`go`, `c`, `r`, `d`, `ai`): they collide
 *   with initials, and `isGenericTerm` matches the WHOLE value, so a real one-word name
 *   would be spared outright.
 * - multi-word entries are listed WHOLE (`iso 27001`): `isGenericCompound` refuses a
 *   compound carrying a digit token, so a standard's number cannot fall out word by word.
 */
export const TECH_TERMS: string[] = [
  // ── Languages & runtimes ───────────────────────────────────────────────────────
  "javascript", "typescript", "python", "java", "kotlin", "scala", "golang", "php",
  "perl", "haskell", "erlang", "elixir", "clojure", "fortran", "cobol", "assembler",
  "bash", "powershell", "zsh", "shell", "sql", "plsql", "tsql", "graphql", "wasm",
  "webassembly", "node", "nodejs", "deno", "jvm", "dotnet", ".net", "runtime",
  "interpréteur", "interpreteur", "interpreter", "compilateur", "compiler", "transpiler", "linter",
  "polyfill", "bytecode", "garbage collector", "ramasse-miettes",

  // ── Frameworks & libraries ─────────────────────────────────────────────────────
  "react", "angular", "vue", "svelte", "nuxt", "remix", "astro", "solid", "preact",
  "express", "fastify", "nest", "nestjs", "laravel", "symfony", "spring boot",
  "hibernate", "flask", "fastapi", "rails", "tailwind", "bootstrap", "jquery",
  "lodash", "redux", "zustand", "webpack", "vite", "rollup", "esbuild", "babel",
  "eslint", "prettier", "vitest", "jest", "playwright", "cypress", "selenium",
  "storybook", "framework", "bibliothèque", "bibliotheque", "library", "sdk", "api", "rest", "grpc",
  "websocket", "webhook", "middleware", "endpoint", "boilerplate", "monorepo",

  // ── Databases & storage ────────────────────────────────────────────────────────
  "postgresql", "postgres", "mysql", "mariadb", "sqlite", "mongodb", "couchdb", "dynamodb", "redis", "memcached", "elasticsearch", "opensearch",
  "clickhouse", "snowflake", "bigquery", "duckdb", "neo4j", "influxdb", "timescaledb",
  "base de données", "base de donnees", "database", "datenbank", "base de datos", "banco de dados",
  "schema", "migration", "requête sql", "requete sql", "index", "cluster", "shard", "sharding",
  "replication", "replica", "sauvegarde", "backup", "restauration", "restore",
  "entrepôt de données", "entrepot de donnees", "data warehouse", "lac de donnees", "data lake", "etl",

  // ── Containers, orchestration, infra ──────────────────────────────────────────
  "docker", "dockerfile", "docker-compose", "podman", "containerd", "kubernetes",
  "k8s", "helm", "kustomize", "openshift", "nomad", "terraform", "opentofu",
  "ansible", "puppet", "chef", "pulumi", "vagrant", "conteneur", "container",
  "orchestrateur", "orchestrator", "pod", "namespace", "ingress", "sidecar",
  "serverless", "microservice", "microservices", "monolithe", "monolith",
  "infrastructure as code", "machine virtuelle", "virtual machine", "hyperviseur",
  "hypervisor", "bare metal", "load balancer", "répartiteur de charge", "repartiteur de charge", "reverse proxy",
  "nginx", "apache httpd", "haproxy", "traefik", "envoy", "istio", "cdn",

  // ── CI/CD & tooling ───────────────────────────────────────────────────────────
  "git", "gitflow", "monodépôt", "monodepot", "pull request", "merge request", "rebase", "cherry-pick",
  "pipeline", "intégration continue", "integration continue", "continuous integration", "déploiement continu", "deploiement continu",
  "continuous deployment", "build", "artefact", "artifact", "registry", "runner",
  "npm", "pnpm", "yarn", "pip", "poetry", "maven", "gradle", "cargo", "composer",
  "homebrew", "apt", "rpm", "changelog", "semver", "versionnage sémantique", "versionnage semantique",
  "feature flag", "rollback", "canary", "blue-green", "staging", "préproduction", "preproduction",
  "production", "recette", "sandbox", "bac à sable", "bac a sable",

  // ── Observability & incidents ─────────────────────────────────────────────────
  "observabilité", "observabilite", "observability", "monitoring", "supervision", "télémétrie", "telemetrie",
  "telemetry", "métrique", "metrique", "metrics", "trace", "tracing", "span", "log", "logs",
  "journalisation", "alerting", "astreinte", "on-call", "post-mortem", "postmortem",
  "incident", "sev1", "sev2", "sla", "slo", "sli", "mttr", "mtbf", "uptime",
  "disponibilité", "disponibilite", "latence", "latency", "débit", "debit", "throughput", "goulot d'étranglement", "goulot d'etranglement",
  "bottleneck", "fuite mémoire", "fuite memoire", "memory leak", "stack trace", "trace d'appels",
  "cœur de fichier", "core dump", "profilage", "profiling", "benchmark",

  // ── Security, compliance, frameworks ──────────────────────────────────────────
  "iso 27001", "iso 27701", "iso 9001", "soc 2", "soc2", "pci dss", "hipaa", "nis2",
  "eidas", "secnumcloud", "hds", "owasp", "cve", "cvss", "cwe", "mitre att&ck",
  "pentest", "test d'intrusion", "audit de sécurité", "audit de securite", "security audit", "analyse de risque",
  "threat model", "modèle de menace", "modele de menace", "chiffrement", "encryption", "hachage", "hashing",
  "signature numérique", "signature numerique", "authentification", "authentication", "autorisation",
  "authorization", "jeton", "token", "oauth", "oidc", "saml", "sso", "mfa", "2fa",
  "certificat", "certificate", "tls", "ssl", "https", "vpn", "pare-feu", "firewall",
  "waf", "ids", "ips", "siem", "zero trust", "confiance zéro", "confiance zero", "moindre privilège", "moindre privilege",
  "least privilege", "cloisonnement", "durcissement", "hardening", "vulnérabilité", "vulnerabilite",
  "vulnerability", "correctif", "patch", "rustine", "faille", "exploit", "backdoor",
  "porte dérobée", "porte derobee", "hameçonnage", "hameconnage", "phishing", "rançongiciel", "rancongiciel", "ransomware",
  "logiciel malveillant", "malware", "bac à sable de sécurité", "bac a sable de securite", "sandboxing",

  // ── Protocols, formats, network ───────────────────────────────────────────────
  "http", "http/2", "http/3", "tcp", "udp", "quic", "dns", "dhcp", "smtp", "imap",
  "pop3", "ftp", "sftp", "ssh", "rsync", "webdav", "mqtt", "amqp", "rabbitmq",
  "json", "jsonl", "ndjson", "yaml", "toml", "xml", "csv", "tsv", "parquet", "avro",
  "protobuf", "protocol buffers", "base64", "utf-8", "unicode", "ascii", "regex",
  "expression régulière", "expression reguliere", "uuid", "hash", "checksum", "somme de contrôle", "somme de controle",
  "adresse ip", "ip address", "sous-réseau", "sous-reseau", "subnet", "passerelle", "gateway",
  "port", "proxy", "tunnel", "bande passante", "bandwidth", "paquet", "packet",

  // ── Data, AI & processing ─────────────────────────────────────────────────────
  "modèle de langage", "modele de langage", "language model", "llm", "embedding", "plongement",
  "vectorisation", "tokenisation", "tokenizer", "prompt", "inférence", "inference", "fine-tuning",
  "affinage", "entraînement", "entrainement", "training", "jeu de données", "jeu de donnees", "dataset", "corpus",
  "annotation", "étiquetage", "etiquetage", "labeling", "apprentissage automatique",
  "machine learning", "apprentissage profond", "deep learning", "réseau de neurones", "reseau de neurones",
  "neural network", "transformeur", "transformer", "quantification", "quantization",
  "onnx", "gpu", "cpu", "tpu", "npu", "vram", "batch", "lot", "epoch", "hyperparamètre", "hyperparametre",
  "hyperparameter", "surapprentissage", "overfitting", "rappel", "recall", "précision", "precision",
  "faux positif", "false positive", "faux négatif", "faux negatif", "false negative", "matrice de confusion",

  // ── Architecture & methodology ─────────────────────────────────────────────────
  "architecture", "architecture hexagonale", "clean architecture", "event sourcing",
  "cqrs", "domain driven design", "ddd", "design pattern", "patron de conception",
  "refactoring", "refactorisation", "dette technique", "technical debt", "code review",
  "revue de code", "paire", "pair programming", "tdd", "bdd", "couverture de tests",
  "test coverage", "test unitaire", "unit test", "test d'intégration", "test d'integration", "integration test",
  "test de bout en bout", "end-to-end", "e2e", "smoke test", "regression",
  "spécification", "specification", "cahier des charges", "user story", "epic", "backlog", "sprint",
  "rétrospective", "retrospective", "kanban", "scrum", "agile", "roadmap", "feuille de route",
  "livrable", "deliverable", "jalon", "milestone", "poc", "mvp", "proof of concept",
];

/**
 * The words that STRUCTURE a tool's documentation (MCP, analytics, SQL).
 *
 * ⚠️ Re-measured on 15/08 on PostHog's `execute-sql` tool doc: « ##### 1. System
 * Data » read as a name manufactured the System/system aliases, and « entity » became a
 * surname — then `applyVault` rewrote EVERY occurrence in the conversation, tool
 * results included. The model was reading a doc describing `ghislain.*` tables and writing
 * SQL against them. `genericTermsData.ts`'s block covered data/schema/query, but not
 * these two. Same discipline as the volume above: none is a standalone PII, none
 * doubles as a first name or surname (`vocabGuards.test.ts` fails otherwise if it does).
 * End-to-end regression: `../toolMetadata.test.ts`.
 */
export const TOOL_DOC_TERMS: string[] = [
  "system", "systems", "système", "systèmes", "systeme", "systemes",
  "entity", "entities", "entité", "entités", "entite", "entites",
  "column", "columns", "colonne", "colonnes", "row", "rows",
  "catalog", "catalogue", "catalogs", "catalogues", "warehouse",
  "cursor", "curseur", "offset", "aggregate", "aggregation", "agrégation", "agregation",
];
