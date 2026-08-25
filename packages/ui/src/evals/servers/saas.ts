import { str, type FakeServer } from "./kit";

// The SaaS fleet: Notion, Slack (names from `packages/connectors/src/slack.ts`),
// Stripe (the real remote MCP's read/write split — `stripe_api_read`/`_write` is the
// generic-name pair `isWriteTool` falls back to descriptions on).

export const NOTION: FakeServer = {
  id: "notion",
  tools: [
    {
      name: "search",
      description: "Rechercher des pages et bases dans l'espace Notion de l'utilisateur.",
      inputSchema: { type: "object", properties: { query: str("Termes de recherche") }, required: ["query"] },
      result: '2 pages : « CRM clients » (base), « Compte-rendu — Karl Studio » (page, modifiée hier)',
    },
    {
      name: "create_page",
      description: "Créer une nouvelle page Notion avec un titre et un contenu.",
      inputSchema: {
        type: "object",
        properties: { title: str("Titre de la page"), content: str("Contenu Markdown") },
        required: ["title", "content"],
      },
      result: "Page créée.",
    },
  ],
};

export const SLACK: FakeServer = {
  id: "slack",
  tools: [
    {
      name: "list_channels",
      description: "Lister les canaux Slack accessibles.",
      inputSchema: { type: "object", properties: {} },
      result: "#general · #ventes · #design",
    },
    {
      name: "read_channel",
      description: "Lire les derniers messages d'un canal.",
      inputSchema: { type: "object", properties: { channel: str("Nom du canal") }, required: ["channel"] },
      result: "claire: le devis Karl Studio est signé 🎉\nmarc: je préviens la prod",
    },
    {
      name: "search_messages",
      description: "Rechercher des messages dans l'espace Slack.",
      inputSchema: { type: "object", properties: { query: str("Termes de recherche") }, required: ["query"] },
      result: '1 résultat — #ventes, claire : « le devis Karl Studio est signé 🎉 »',
    },
    {
      name: "send_message",
      description: "Envoyer un message dans un canal ou à une personne. Action irréversible.",
      inputSchema: {
        type: "object",
        properties: { channel: str("Canal ou @personne"), text: str("Message") },
        required: ["channel", "text"],
      },
      result: "Message envoyé.",
    },
  ],
};

export const STRIPE: FakeServer = {
  id: "stripe",
  tools: [
    {
      name: "stripe_api_read",
      description: "Retrieve or list Stripe resources (customers, invoices, charges). Read-only.",
      inputSchema: { type: "object", properties: { resource: str("Resource type"), query: str("Search terms") }, required: ["resource"] },
      result: '{"customers":[{"id":"cus_001","name":"Karl Studio","email":"contact@karl-studio.fr","balance":0}]}',
    },
    {
      name: "stripe_api_write",
      description: "Create or update a Stripe resource (refund, invoice, customer). Mutating.",
      inputSchema: {
        type: "object",
        properties: { resource: str("Resource type"), operation: str("create|update"), payload: str("JSON payload") },
        required: ["resource", "operation"],
      },
      result: '{"ok":true,"id":"re_001"}',
    },
  ],
};
