import { str, type FakeServer } from "./kit";

// Fourth wave — the remaining business/analytics REMOTE connectors. Same contract
// as fleet3: 1-2 key tools transcribed, fixture results, re-alignment on the first
// real `tools/list`.

const one = (id: string, tools: FakeServer["tools"]): FakeServer => ({ id, tools });
const q = (d: string) => ({ type: "object", properties: { query: str(d) }, required: ["query"] });

export const BUSINESS_FLEET: FakeServer[] = [
  one("superhuman", [
    { name: "search_emails", description: "Rechercher dans les e-mails Superhuman.", inputSchema: q("Termes de recherche"), result: "jean.vannec@karl-studio.fr — « Planning révisé » (hier 17:41)" },
    { name: "send_email", description: "Envoyer un e-mail via Superhuman. Action d'écriture.", inputSchema: { type: "object", properties: { to: str("Destinataire"), subject: str("Objet"), body: str("Corps") }, required: ["to", "subject", "body"] }, result: "E-mail envoyé." },
  ]),
  one("attio", [
    { name: "search-records", description: "Rechercher des enregistrements (personnes, sociétés, deals).", inputSchema: q("Nom, e-mail ou société"), result: "Atelier Torbel — claire@atelier-torbel.fr — deal « Refonte site » (Proposition envoyée). record_id: rec-as77" },
    { name: "create-note", description: "Ajouter une note sur un enregistrement. Action d'écriture.", inputSchema: { type: "object", properties: { parent_object: str("Type"), parent_record_id: str("Id"), content: str("Note") }, required: ["parent_object", "parent_record_id", "content"] }, result: "Note créée." },
  ]),
  one("close", [
    { name: "search_leads", description: "Rechercher des leads dans Close CRM.", inputSchema: q("Nom ou société"), result: "Lead : Studio Velin — stade Qualifié, dernier appel il y a 6 jours." },
  ]),
  one("square", [
    { name: "list_payments", description: "Lister les paiements Square récents.", inputSchema: { type: "object", properties: { limit: { type: "number", description: "Nombre (défaut 10)" } } }, result: "2 paiements : 89 € (atelier, hier) · 145 € (formation, lundi)." },
  ]),
  one("zapier", [
    { name: "run_zap", description: "Déclencher une automatisation Zapier.", inputSchema: { type: "object", properties: { zap: str("Nom du Zap"), input: str("Données, optionnel") }, required: ["zap"] }, result: "Zap « Nouveau client → Slack » déclenché." },
  ]),
  one("wix", [
    { name: "list_orders", description: "Lister les commandes de la boutique Wix.", inputSchema: { type: "object", properties: {} }, result: "1 commande en attente : #1082 — 240 € (Atelier Torbel)." },
  ]),
  one("webflow", [
    { name: "list_collections", description: "Lister les collections CMS du site Webflow.", inputSchema: { type: "object", properties: {} }, result: "Collections : Articles (24 items) · Projets (11 items)" },
    { name: "update_item", description: "Mettre à jour un item CMS. Action d'écriture.", inputSchema: { type: "object", properties: { collection: str("Collection"), item_id: str("Id"), fields: str("Champs JSON") }, required: ["collection", "item_id", "fields"] }, result: "Item publié." },
  ]),
  one("cloudinary", [
    { name: "search_assets", description: "Rechercher des médias dans Cloudinary.", inputSchema: q("Termes de recherche"), result: "3 images « logo-karl » (dossier clients/karl, png, 1200×630)." },
  ]),
  one("websitepublisher", [
    { name: "publish_page", description: "Créer/publier une page de site par conversation. Action d'écriture.", inputSchema: { type: "object", properties: { title: str("Titre"), content: str("Contenu") }, required: ["title", "content"] }, result: "Page publiée : /offre-ete (en ligne)." },
  ]),
  one("morningstar", [
    { name: "search_investments", description: "Rechercher des données d'investissement Morningstar.", inputSchema: q("Nom ou ISIN"), result: "ETF World (FR0011871110) — note ★★★★, frais 0,38 %, perf 1 an +11,2 %." },
  ]),
  one("vantage", [
    { name: "get_cost_report", description: "Analyser les coûts cloud du compte.", inputSchema: { type: "object", properties: { period: str("Période, optionnel") } }, result: "Juillet : 412 € (+18 % vs juin) — pic : stockage S3 (+34 %)." },
  ]),
  one("synapse", [
    { name: "search_datasets", description: "Rechercher des jeux de données scientifiques Synapse.", inputSchema: q("Termes de recherche"), result: "1 dataset : « EU SME Digital Adoption 2025 » (syn-88213, CSV, 4,2 Mo)." },
  ]),
  one("amplitude", [
    { name: "query_chart", description: "Lire un graphique/une métrique Amplitude.", inputSchema: { type: "object", properties: { chart: str("Nom du chart") }, required: ["chart"] }, result: "Rétention J7 : 34 % (+2 pts sur 30 jours)." },
  ]),
  one("posthog", [
    { name: "insights-get-all", description: "Lister/lire les insights PostHog du projet.", inputSchema: { type: "object", properties: { search: str("Filtre, optionnel") } }, result: "« Activation onboarding » : 61 % (+4 pts) · « Envois redacted/jour » : 8 412." },
  ]),
];
