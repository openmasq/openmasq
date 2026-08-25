import type { Connector, ConnectorTool, ConnectorToolCtx } from "../types";
import { googleApiErrorHint } from "./googleApiError";

/**
 * Google Docs connector (Docs API v1). Creates documents, reads a document's plain
 * text, and appends text — with the user's token obtained desktop-direct via OAuth
 * loopback + PKCE (no broker/server). The `documents` scope is sensitive (brand
 * verification in prod) but NOT restricted, so there's NO CASA — usable in 1-clic.
 */
const API = "https://docs.googleapis.com/v1/documents";
const MAX_CHARS = 50_000;

interface DocElement {
  paragraph?: { elements?: { textRun?: { content?: string } }[] };
}
interface GDoc {
  documentId?: string;
  title?: string;
  body?: { content?: DocElement[] };
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/** Concatenate every paragraph text run into a single plain-text string. */
function extractText(doc: GDoc): string {
  const parts: string[] = [];
  for (const el of doc.body?.content ?? []) {
    for (const run of el.paragraph?.elements ?? []) {
      if (run.textRun?.content) parts.push(run.textRun.content);
    }
  }
  return parts.join("");
}

const createDocument: ConnectorTool = {
  name: "create_document",
  description:
    "Créer un Google Doc avec un titre, et optionnellement un contenu texte initial. Renvoie l'id et le lien.",
  inputSchema: {
    type: "object",
    required: ["title"],
    properties: {
      title: { type: "string", description: "Titre du document." },
      content: { type: "string", description: "Texte initial optionnel à insérer." },
    },
  },
  async run(args, ctx: ConnectorToolCtx) {
    const title = str(args.title);
    if (!title) return { content: [{ type: "text", text: "title requis." }], isError: true };
    const doc = await ctx.fetchJson<GDoc>(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    const id = doc.documentId;
    if (!id) return { content: [{ type: "text", text: "Création échouée." }], isError: true };
    const content = str(args.content);
    if (content) {
      await ctx.fetchJson(`${API}/${id}:batchUpdate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: [{ insertText: { location: { index: 1 }, text: content } }],
        }),
      });
    }
    return {
      content: [{ type: "text", text: `Document créé : https://docs.google.com/document/d/${id}/edit (id:${id})` }],
    };
  },
};

const readDocument: ConnectorTool = {
  name: "read_document",
  description: "Lire le texte d'un Google Doc par son id.",
  inputSchema: {
    type: "object",
    required: ["documentId"],
    properties: { documentId: { type: "string", description: "L'id du document." } },
  },
  async run(args, ctx: ConnectorToolCtx) {
    const documentId = str(args.documentId);
    if (!documentId) return { content: [{ type: "text", text: "documentId requis." }], isError: true };
    const doc = await ctx.fetchJson<GDoc>(`${API}/${documentId}`);
    const raw = extractText(doc);
    const text = raw.length > MAX_CHARS ? `${raw.slice(0, MAX_CHARS)}\n…(tronqué)` : raw;
    return { content: [{ type: "text", text: `# ${doc.title ?? "(sans titre)"}\n\n${text || "(vide)"}` }] };
  },
};

const appendText: ConnectorTool = {
  name: "append_text",
  description: "Ajouter du texte à la fin d'un Google Doc existant (par son id).",
  inputSchema: {
    type: "object",
    required: ["documentId", "text"],
    properties: {
      documentId: { type: "string", description: "L'id du document." },
      text: { type: "string", description: "Le texte à ajouter à la fin." },
    },
  },
  async run(args, ctx: ConnectorToolCtx) {
    const documentId = str(args.documentId);
    const text = str(args.text);
    if (!documentId || !text) {
      return { content: [{ type: "text", text: "documentId et text sont requis." }], isError: true };
    }
    await ctx.fetchJson(`${API}/${documentId}:batchUpdate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [{ insertText: { endOfSegmentLocation: {}, text: `\n${text}` } }],
      }),
    });
    return { content: [{ type: "text", text: "Texte ajouté au document." }] };
  },
};

export const googleDocsConnector: Connector = {
  id: "google-docs",
  name: "Google Docs",
  auth: "pkce",
  // `documents` is sensitive (brand verification) but NOT restricted → no CASA.
  scopes: {
    managed: ["https://www.googleapis.com/auth/documents"],
    byo: ["https://www.googleapis.com/auth/documents"],
  },
  tools: [createDocument, readDocument, appendText],
  // Applied by the adapter to EVERY call (`run.ts`), so a tool added later
  // cannot forget it — the reason this lives on the connector, not per tool.
  errorHint: (err) =>
    googleApiErrorHint(err, {
      api: "API Google Docs",
      connector: "Google Docs",
      scope: "l'accès à vos DOCUMENTS",
      fallback: "Accès Google Docs impossible",
    }),
};
