import { str, type FakeServer } from "./kit";

// Second wave of the fleet — the COVERAGE goal: every connector in the catalogue
// eventually gets its FakeServer (names/schemas transcribed from the real thing,
// fixture results themed Karl Studio / Atelier Torbel). Used by the elaborate
// scenarios (`catalog.workflows2.ts`) and by `OPENMASQ_EVAL_SERVERS=all` mode (conflicts).

export const GITHUB: FakeServer = {
  id: "github",
  tools: [
    {
      name: "list_repo_issues",
      description: "Lister les issues ouvertes d'un dépôt (owner/repo).",
      inputSchema: {
        type: "object",
        properties: { repo: str("Dépôt au format owner/repo") },
        required: ["repo"],
      },
      result: "2 issues ouvertes :\n#118 Export CSV vide sur Safari\n#121 Lenteur du tableau de bord",
    },
    {
      name: "create_issue",
      description: "Créer une issue dans un dépôt. Action d'écriture.",
      inputSchema: {
        type: "object",
        properties: {
          repo: str("Dépôt au format owner/repo"),
          title: str("Titre de l'issue"),
          body: str("Description, optionnel"),
        },
        required: ["repo", "title"],
      },
      result: "Issue #122 créée.",
    },
  ],
};

export const MONDAY: FakeServer = {
  id: "monday",
  tools: [
    {
      name: "get_board_items",
      description: "Lister les items d'un board monday.com (nom, statut, colonnes).",
      inputSchema: {
        type: "object",
        properties: { board: str("Nom ou id du board") },
        required: ["board"],
      },
      result:
        "Board « Facturation » :\n- « Karl Studio — facturation » [Payé]\n- « Atelier Torbel — facturation » [En attente] (item id: 4471)",
    },
    {
      name: "update_item",
      description: "Mettre à jour un item monday.com (statut/colonnes). Action d'écriture.",
      inputSchema: {
        type: "object",
        properties: {
          item_id: str("Id de l'item (voir get_board_items)"),
          status: str("Nouveau statut"),
          note: str("Commentaire, optionnel"),
        },
        required: ["item_id", "status"],
      },
      result: "Item mis à jour.",
    },
  ],
};

export const INTERCOM: FakeServer = {
  id: "intercom",
  tools: [
    {
      name: "list_conversations",
      description: "Lister les conversations support récentes (client, sujet, état).",
      inputSchema: {
        type: "object",
        properties: { state: str("Filtre d'état (open/closed), optionnel") },
      },
      result:
        "2 conversations ouvertes :\n- claire@atelier-torbel.fr — « Export PDF en erreur » (il y a 2 h)\n- jean.vannec@karl-studio.fr — « Question facturation » (hier)",
    },
  ],
};

export const CANVA: FakeServer = {
  id: "canva",
  tools: [
    {
      name: "search-folders",
      description: "Rechercher des dossiers dans le compte Canva de l'utilisateur.",
      inputSchema: {
        type: "object",
        properties: { query: str("Termes de recherche") },
        required: ["query"],
      },
      result: '1 dossier : « Présentations clients » (id: fld-firstQ)',
    },
    {
      name: "export-design",
      description: "Exporter un design Canva (PDF/PNG). Renvoie un lien de téléchargement.",
      inputSchema: {
        type: "object",
        properties: { design_id: str("Id du design"), format: str("pdf ou png") },
        required: ["design_id"],
      },
      result: "Export lancé (job ex-2210) — fichier prêt.",
    },
  ],
};

export const PAYPAL: FakeServer = {
  id: "paypal",
  tools: [
    {
      name: "list_transactions",
      description: "Lister les transactions PayPal récentes (payeur, montant, référence).",
      inputSchema: {
        type: "object",
        properties: { limit: { type: "number", description: "Nombre de résultats (défaut 10)." } },
      },
      result:
        'Transactions :\n- 750,00 € reçus de Atelier Torbel — référence « INV-3007 » (aujourd\'hui, réglée via PayPal)\n- 120,00 € reçus de Studio Velin — référence « INV-2999 » (il y a 3 jours)',
    },
  ],
};

export const JOTFORM: FakeServer = {
  id: "jotform",
  tools: [
    {
      name: "list_forms",
      description: "Lister les formulaires Jotform de l'utilisateur.",
      inputSchema: { type: "object", properties: {} },
      result: "2 formulaires : « Brief client » (14 réponses) · « Inscription atelier » (52 réponses)",
    },
    {
      name: "get_form_submissions",
      description: "Lire les dernières réponses d'un formulaire.",
      inputSchema: {
        type: "object",
        properties: { form: str("Nom ou id du formulaire") },
        required: ["form"],
      },
      result: "Dernière réponse « Brief client » : Atelier Torbel — refonte du site vitrine, budget 8 000 €.",
    },
  ],
};
