import type { Connector, ConnectorTool, ConnectorToolCtx } from "../types";
import { googleApiErrorHint } from "./googleApiError";

/**
 * Google Sheets connector (Sheets API v4). Reads a range, appends a row, and creates
 * a spreadsheet — with the user's token obtained desktop-direct via OAuth loopback +
 * PKCE (no broker/server). The `spreadsheets` scope is sensitive (brand verification
 * in prod) but NOT restricted, so there's NO CASA — usable in 1-clic.
 */
const API = "https://sheets.googleapis.com/v4/spreadsheets";
const MAX_CHARS = 50_000;

interface ValueRange {
  values?: unknown[][];
}
interface Spreadsheet {
  spreadsheetId?: string;
  spreadsheetUrl?: string;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

const readRange: ConnectorTool = {
  name: "read_range",
  description:
    "Lire une plage d'une feuille Google Sheets (notation A1, ex. « Feuille1!A1:D20 »). Renvoie les lignes.",
  inputSchema: {
    type: "object",
    required: ["spreadsheetId", "range"],
    properties: {
      spreadsheetId: { type: "string", description: "L'id du classeur." },
      range: { type: "string", description: "La plage en notation A1 (ex. Feuille1!A1:D20)." },
    },
  },
  async run(args, ctx: ConnectorToolCtx) {
    const spreadsheetId = str(args.spreadsheetId);
    const range = str(args.range);
    if (!spreadsheetId || !range) {
      return { content: [{ type: "text", text: "spreadsheetId et range sont requis." }], isError: true };
    }
    const res = await ctx.fetchJson<ValueRange>(
      `${API}/${spreadsheetId}/values/${encodeURIComponent(range)}`,
    );
    const rows = (res.values ?? []).map((r) => r.map((c) => (c == null ? "" : String(c))).join("\t"));
    const text = rows.join("\n").slice(0, MAX_CHARS);
    return { content: [{ type: "text", text: text || "Plage vide." }] };
  },
};

const appendRow: ConnectorTool = {
  name: "append_row",
  description:
    "Ajouter une ligne de valeurs à la fin d'une feuille Google Sheets. `values` = la liste des cellules.",
  inputSchema: {
    type: "object",
    required: ["spreadsheetId", "range", "values"],
    properties: {
      spreadsheetId: { type: "string", description: "L'id du classeur." },
      range: { type: "string", description: "La feuille/plage cible (ex. Feuille1!A1)." },
      values: { type: "array", items: { type: "string" }, description: "Les cellules de la nouvelle ligne." },
    },
  },
  async run(args, ctx: ConnectorToolCtx) {
    const spreadsheetId = str(args.spreadsheetId);
    const range = str(args.range);
    const values = Array.isArray(args.values)
      ? args.values.map((v) => (v == null ? "" : String(v)))
      : [];
    if (!spreadsheetId || !range || values.length === 0) {
      return {
        content: [{ type: "text", text: "spreadsheetId, range et values (non vide) sont requis." }],
        isError: true,
      };
    }
    await ctx.fetchJson(
      `${API}/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values: [values] }),
      },
    );
    return { content: [{ type: "text", text: "Ligne ajoutée." }] };
  },
};

const createSpreadsheet: ConnectorTool = {
  name: "create_spreadsheet",
  description: "Créer un nouveau classeur Google Sheets avec un titre. Renvoie l'id et le lien.",
  inputSchema: {
    type: "object",
    required: ["title"],
    properties: { title: { type: "string", description: "Titre du classeur." } },
  },
  async run(args, ctx: ConnectorToolCtx) {
    const title = str(args.title);
    if (!title) return { content: [{ type: "text", text: "title requis." }], isError: true };
    const sheet = await ctx.fetchJson<Spreadsheet>(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ properties: { title } }),
    });
    const id = sheet.spreadsheetId;
    const url = sheet.spreadsheetUrl ?? (id ? `https://docs.google.com/spreadsheets/d/${id}/edit` : "");
    return { content: [{ type: "text", text: `Classeur créé : ${url} (id:${id ?? "?"})` }] };
  },
};

export const googleSheetsConnector: Connector = {
  id: "google-sheets",
  name: "Google Sheets",
  auth: "pkce",
  // `spreadsheets` is sensitive (brand verification) but NOT restricted → no CASA.
  scopes: {
    managed: ["https://www.googleapis.com/auth/spreadsheets"],
    byo: ["https://www.googleapis.com/auth/spreadsheets"],
  },
  tools: [readRange, appendRow, createSpreadsheet],
  // Applied by the adapter to EVERY call (`run.ts`), so a tool added later
  // cannot forget it — the reason this lives on the connector, not per tool.
  errorHint: (err) =>
    googleApiErrorHint(err, {
      api: "API Google Sheets",
      connector: "Google Sheets",
      scope: "l'accès à vos FEUILLES DE CALCUL",
      fallback: "Accès Google Sheets impossible",
    }),
};
