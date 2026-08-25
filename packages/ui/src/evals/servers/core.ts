import { str, type FakeServer } from "./kit";

// The core fleet: mail (read+write pair), the agent browser, a read-only CRM.
// Tool names are transcribed from the REAL connectors — gmail from
// `packages/connectors/src/google/gmailRead.ts`/`gmailSend.ts`, the browser from the
// desktop allow-list (`apps/desktop/src/main/mcp/browserTools.ts`) — so the loop's
// classifiers (`isWriteTool`, `isSearchTool`, `browser_*`) see the production vocabulary.

/** Gmail — the canonical read + write pair: reads never confirm, `send_email` must. */
export const GMAIL: FakeServer = {
  id: "gmail",
  tools: [
    {
      name: "search_messages",
      description: "Rechercher des e-mails dans la boîte de réception (requête Gmail).",
      inputSchema: { type: "object", properties: { query: str("Requête de recherche Gmail") }, required: ["query"] },
      result: (args) =>
        `2 résultats pour « ${String(args.query ?? "")} » :\n` +
        "1. De : contact@karl-studio.fr — Objet : Devis Q3 — « Bonjour, ci-joint le devis signé. »\n" +
        "2. De : contact@karl-studio.fr — Objet : Relance — « Avez-vous eu le temps de regarder ? »",
    },
    {
      name: "list_recent",
      description: "Lister les e-mails les plus récents de la boîte de réception.",
      inputSchema: { type: "object", properties: { count: { type: "number", description: "Nombre d'e-mails (défaut 10)" } } },
      result:
        "3 e-mails récents :\n1. contact@karl-studio.fr — Devis Q3\n2. newsletter@lemonde.fr — L'actu du jour\n3. no-reply@github.com — CI passed",
    },
    {
      name: "send_email",
      description: "Envoyer un e-mail depuis le compte de l'utilisateur. Action irréversible.",
      inputSchema: {
        type: "object",
        properties: { to: str("Adresse du destinataire"), subject: str("Objet"), body: str("Corps du message") },
        required: ["to", "subject", "body"],
      },
      result: "E-mail envoyé.",
    },
  ],
};

/** The built-in agent browser. Tool names carry the `browser_*` convention the loop
 *  detects on (NOT the connector id) — the redaction policy, the nav gates and the
 *  read-only mode all key off these exact names. */
export const BROWSER: FakeServer = {
  id: "browser",
  tools: [
    {
      name: "browser_navigate",
      description: "Naviguer vers une URL. La page chargée est ensuite lisible via browser_snapshot.",
      inputSchema: { type: "object", properties: { url: str("URL complète (https://…)") }, required: ["url"] },
      result: (args) => {
        const url = String(args.url ?? "");
        // A "search engine" answers like one; any other host answers like a site page.
        if (/google\.[a-z.]+\/search|bing\.com\/search|duckduckgo\.com/.test(url)) {
          return `Résultats de recherche pour ${url} :\n1. Karl Studio — agence de design à Évreux — karl-studio.fr\n2. Karl Studio (LinkedIn) — 12 employés`;
        }
        return `Page chargée : ${url}\n\nKarl Studio — agence de design basée à Évreux.\nContact : contact@karl-studio.fr · 02 32 00 00 00`;
      },
    },
    {
      name: "browser_snapshot",
      description: "Capturer l'arborescence d'accessibilité de la page courante (lecture).",
      inputSchema: { type: "object", properties: {} },
      result: "heading « Karl Studio » · link « Contact » · text « agence de design basée à Évreux »",
    },
    {
      name: "browser_navigate_back",
      description: "Revenir à la page précédente.",
      inputSchema: { type: "object", properties: {} },
      result: "Page précédente restaurée.",
    },
    {
      name: "browser_click",
      description: "Cliquer sur un élément de la page (interaction).",
      inputSchema: { type: "object", properties: { element: str("Description de l'élément"), ref: str("Référence du snapshot") }, required: ["element", "ref"] },
      result: "Clic effectué.",
    },
    {
      name: "browser_type",
      description: "Saisir du texte dans un champ de la page (interaction).",
      inputSchema: {
        type: "object",
        properties: { element: str("Champ cible"), ref: str("Référence du snapshot"), text: str("Texte à saisir") },
        required: ["element", "ref", "text"],
      },
      result: "Texte saisi.",
    },
    {
      name: "browser_fill_form",
      description: "Remplir plusieurs champs d'un formulaire puis le soumettre (interaction).",
      inputSchema: { type: "object", properties: { fields: { type: "array", description: "Champs {ref, value}" } }, required: ["fields"] },
      result: "Formulaire soumis.",
    },
  ],
};

/** A read-only CRM — for "does it read before it writes" sequencing. */
export const CRM: FakeServer = {
  id: "hubspot",
  tools: [
    {
      name: "get_contact",
      description: "Récupérer la fiche d'un contact CRM par son nom ou e-mail.",
      inputSchema: { type: "object", properties: { name: str("Nom ou e-mail du contact") }, required: ["name"] },
      result: '{"name":"Karl Studio","email":"contact@karl-studio.fr","tier":"gold","owner":"claire@zorvia.fr"}',
    },
    {
      name: "list_deals",
      description: "Lister les transactions en cours du portefeuille.",
      inputSchema: { type: "object", properties: {} },
      result: '[{"deal":"Refonte site","amount":"18 000 €","stage":"proposal"},{"deal":"Branding","amount":"7 500 €","stage":"won"}]',
    },
  ],
};
