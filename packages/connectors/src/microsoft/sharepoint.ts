import type { Connector, ConnectorTool, ConnectorToolCtx } from "../types";
import { GRAPH, MAX_CHARS, clampLimit, str } from "./graph";

/**
 * SharePoint connector (Microsoft Graph — sites & document libraries). Search sites,
 * list a site's root documents, read a document's text. Its scopes
 * (`Sites.Read.All` / `Files.Read.All`) require ADMIN CONSENT, so this is **BYO-ONLY**
 * — usable only under the user's own registered app (the app's public client can't
 * grant admin-consent scopes). Token obtained desktop-direct via Microsoft PKCE.
 */
interface Site {
  id?: string;
  displayName?: string;
  name?: string;
  webUrl?: string;
}
interface DriveItem {
  id?: string;
  name?: string;
  folder?: unknown;
  file?: { mimeType?: string };
}

const searchSites: ConnectorTool = {
  name: "search_sites",
  description: "Rechercher des sites SharePoint par mot-clé. Renvoie le nom, l'id et l'URL.",
  inputSchema: {
    type: "object",
    required: ["query"],
    properties: { query: { type: "string", description: "Texte à chercher dans les sites." } },
  },
  async run(args, ctx: ConnectorToolCtx) {
    const query = str(args.query);
    if (!query) return { content: [{ type: "text", text: "query requis." }], isError: true };
    const res = await ctx.fetchJson<{ value?: Site[] }>(
      `${GRAPH}/sites?search=${encodeURIComponent(query)}`,
    );
    const rows = (res.value ?? []).map(
      (s) => `${s.displayName ?? s.name ?? "(sans nom)"} — ${s.webUrl ?? ""} · siteId:${s.id}`,
    );
    return { content: [{ type: "text", text: rows.join("\n") || "Aucun site." }] };
  },
};

const listDocuments: ConnectorTool = {
  name: "list_documents",
  description: "Lister les documents à la racine de la bibliothèque d'un site SharePoint (par siteId).",
  inputSchema: {
    type: "object",
    required: ["siteId"],
    properties: {
      siteId: { type: "string", description: "L'id du site (voir search_sites)." },
      limit: { type: "number", description: "Nombre d'éléments (défaut 25, max 60)." },
    },
  },
  async run(args, ctx: ConnectorToolCtx) {
    const siteId = str(args.siteId);
    if (!siteId) return { content: [{ type: "text", text: "siteId requis." }], isError: true };
    const limit = clampLimit(args.limit, 25, 60);
    const res = await ctx.fetchJson<{ value?: DriveItem[] }>(
      `${GRAPH}/sites/${siteId}/drive/root/children?$top=${limit}`,
    );
    const rows = (res.value ?? []).map((f) => {
      const kind = f.folder ? "dossier" : f.file?.mimeType ?? "fichier";
      return `${f.name ?? "(sans nom)"} — ${kind} · id:${f.id}`;
    });
    return { content: [{ type: "text", text: rows.join("\n") || "Bibliothèque vide." }] };
  },
};

const readDocument: ConnectorTool = {
  name: "read_document",
  description: "Lire le contenu texte d'un document SharePoint par siteId + itemId.",
  inputSchema: {
    type: "object",
    required: ["siteId", "itemId"],
    properties: {
      siteId: { type: "string", description: "L'id du site." },
      itemId: { type: "string", description: "L'id du document (voir list_documents)." },
    },
  },
  async run(args, ctx: ConnectorToolCtx) {
    const siteId = str(args.siteId);
    const itemId = str(args.itemId);
    if (!siteId || !itemId) {
      return { content: [{ type: "text", text: "siteId et itemId sont requis." }], isError: true };
    }
    const raw = await ctx.fetchText(`${GRAPH}/sites/${siteId}/drive/items/${itemId}/content`);
    const text = raw.length > MAX_CHARS ? `${raw.slice(0, MAX_CHARS)}\n…(tronqué)` : raw;
    return { content: [{ type: "text", text: text || "(vide ou non lisible en texte)" }] };
  },
};

export const microsoftSharePointConnector: Connector = {
  id: "microsoft-sharepoint",
  name: "SharePoint",
  auth: "microsoft",
  // Sites.Read.All / Files.Read.All need ADMIN CONSENT → BYO-only (user's own app).
  byoOnly: true,
  scopes: { managed: [], byo: ["Sites.Read.All", "Files.Read.All"] },
  tools: [searchSites, listDocuments, readDocument],
};
