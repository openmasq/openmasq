/**
 * The Qdrant connector's tool definitions — what the model sees. The annotations are the
 * write gate's first input (`classifyToolWrite`, then `writeRisk`): the three reads say
 * `readOnlyHint: true`; storing ADDS (a plain write); updating and both deletions OVERWRITE
 * or DESTROY (`destructiveHint: true` ⇒ high risk ⇒ the main-owned confirmation window).
 * `connection.test.ts` pins each tool's classification.
 */
import type { McpTool } from "@openmasq/mcp";

export const TOOL = {
  collections: "qdrant-collections",
  store: "qdrant-store",
  find: "qdrant-find",
  list: "qdrant-list",
  update: "qdrant-update",
  delete: "qdrant-delete",
  deleteCollection: "qdrant-delete-collection",
} as const;

export const LIMITS = { information: 20_000, query: 2_000, findDefault: 5, findMax: 20, listDefault: 20, listMax: 100, deleteMax: 100 };

const str = (description: string) => ({ type: "string", description });

export function toolList(serverId: string, defaultCollection: string): McpTool[] {
  const collection = str(`La collection visée (« ${defaultCollection} » par défaut).`);
  const filter = {
    type: "object",
    description: "Filtre facultatif sur les métadonnées : chaque clé doit valoir exactement la valeur donnée.",
    additionalProperties: { type: ["string", "number", "boolean"] },
  };
  const tools: Omit<McpTool, "serverId">[] = [
    {
      name: TOOL.collections,
      description: "Liste les collections Qdrant disponibles, avec leur nombre d'entrées.",
      inputSchema: { type: "object", properties: {} },
      annotations: { title: "Lister les collections Qdrant", readOnlyHint: true },
    },
    {
      name: TOOL.store,
      description: "Enregistre une information dans une collection Qdrant pour la retrouver plus tard par le sens. Crée la collection si elle n'existe pas. Renvoie l'identifiant de l'entrée.",
      inputSchema: {
        type: "object",
        properties: { information: str("Le texte à enregistrer."), metadata: { type: "object", description: "Données associées, facultatives (JSON)." }, collection },
        required: ["information"],
      },
      annotations: { title: "Enregistrer dans Qdrant", readOnlyHint: false, destructiveHint: false },
    },
    {
      name: TOOL.find,
      description: "Cherche dans une collection Qdrant les entrées les plus proches d'une question, par le sens. Renvoie leurs identifiants.",
      inputSchema: {
        type: "object",
        properties: {
          query: str("Ce qu'on cherche, en langage naturel."),
          limit: { type: "integer", minimum: 1, maximum: LIMITS.findMax, description: `Nombre de résultats (${LIMITS.findDefault} par défaut).` },
          filter,
          collection,
        },
        required: ["query"],
      },
      annotations: { title: "Chercher dans Qdrant", readOnlyHint: true },
    },
    {
      name: TOOL.list,
      description: "Liste les entrées d'une collection Qdrant, page par page, avec leurs identifiants. Pour la page suivante, repasser le « curseur » renvoyé.",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "integer", minimum: 1, maximum: LIMITS.listMax, description: `Entrées par page (${LIMITS.listDefault} par défaut).` },
          cursor: { type: ["string", "integer"], description: "Le curseur renvoyé par la page précédente." },
          filter,
          collection,
        },
      },
      annotations: { title: "Lister une collection Qdrant", readOnlyHint: true },
    },
    {
      name: TOOL.update,
      description: "Modifie une entrée existante : remplace son texte (ré-indexé par le sens) et/ou ses métadonnées. L'ancien contenu est perdu.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: ["string", "integer"], description: "L'identifiant de l'entrée." },
          information: str("Le nouveau texte, facultatif."),
          metadata: { type: "object", description: "Les nouvelles métadonnées, qui remplacent les anciennes. Facultatif." },
          collection,
        },
        required: ["id"],
      },
      annotations: { title: "Modifier une entrée Qdrant", readOnlyHint: false, destructiveHint: true },
    },
    {
      name: TOOL.delete,
      description: "Supprime définitivement des entrées d'une collection Qdrant, par leurs identifiants.",
      inputSchema: {
        type: "object",
        properties: {
          ids: { type: "array", items: { type: ["string", "integer"] }, minItems: 1, maxItems: LIMITS.deleteMax, description: "Les identifiants à supprimer." },
          collection,
        },
        required: ["ids"],
      },
      annotations: { title: "Supprimer des entrées Qdrant", readOnlyHint: false, destructiveHint: true },
    },
    {
      name: TOOL.deleteCollection,
      description: "Supprime définitivement une collection Qdrant entière et tout son contenu. Le nom doit être donné explicitement.",
      inputSchema: { type: "object", properties: { collection: str("Le nom exact de la collection à supprimer.") }, required: ["collection"] },
      annotations: { title: "Supprimer une collection Qdrant", readOnlyHint: false, destructiveHint: true },
    },
  ];
  return tools.map((t) => ({ ...t, serverId }));
}
