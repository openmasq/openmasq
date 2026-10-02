import type { Connector, ConnectorTool, ConnectorToolCtx } from "../types";
import {
  assertFileId,
  remoteTime,
  renderRemoteList,
  sortRemote,
  type RemoteEntry,
} from "../files";
import { GRAPH, MAX_CHARS, clampLimit, str } from "./graph";
import { onedriveUploadFile } from "./onedriveUpload";

/**
 * OneDrive connector (Microsoft Graph — the user's personal drive). Search files +
 * read a text-like file's content, with the user's token obtained desktop-direct via
 * Microsoft loopback + PKCE (public client, no secret). `Files.ReadWrite` is a delegated
 * user scope (no admin consent) so 1-clic works; `byo` widens to `Files.ReadWrite.All`.
 * Write = `upload_file` (`./onedriveUpload.ts`), creating only, never overwriting.
 */
interface DriveItem {
  id?: string;
  name?: string;
  lastModifiedDateTime?: string;
  file?: { mimeType?: string };
  folder?: unknown;
}

/** Escape single quotes for a Graph `search(q='…')` literal. */
const q = (s: string): string => s.replace(/'/g, "''");

/**
 * List a folder's contents — built here, consumed TWICE: by the tool
 * below and by the app's "Folders" panel (`main/cloudfs`).
 */
export function onedriveChildrenUrl(folderId: string | null): string {
  const path = folderId
    ? `/items/${encodeURIComponent(assertFileId(folderId))}/children`
    : "/root/children";
  // Graph refuses an `$orderby` on `folder`: display sorting is done app-side.
  return `${GRAPH}/me/drive${path}?$select=id,name,folder,lastModifiedDateTime&$top=200`;
}

export function parseOnedriveChildren(body: unknown): RemoteEntry[] {
  const items = (body as { value?: DriveItem[] })?.value ?? [];
  return sortRemote(
    items
      .filter((i): i is DriveItem & { id: string; name: string } => !!i.id && !!i.name)
      .map((i) => ({
        id: i.id,
        name: i.name,
        kind: i.folder ? ("dir" as const) : ("file" as const),
        mtime: remoteTime(i.lastModifiedDateTime),
      })),
  );
}

const listFolder: ConnectorTool = {
  name: "list_folder",
  description:
    "Lister le contenu d'un dossier OneDrive (la racine par défaut). Renvoie noms et ids ; utilise l'id d'un dossier pour descendre.",
  inputSchema: {
    type: "object",
    properties: {
      folderId: {
        type: "string",
        description: "L'id du dossier (voir search_files / list_folder). Absent = la racine.",
      },
    },
  },
  async run(args, ctx) {
    const folderId = typeof args.folderId === "string" && args.folderId.trim() ? args.folderId.trim() : null;
    const body = await ctx.fetchJson<unknown>(onedriveChildrenUrl(folderId));
    return { content: [{ type: "text", text: renderRemoteList(parseOnedriveChildren(body)) }] };
  },
};

const searchFiles: ConnectorTool = {
  name: "search_files",
  description: "Rechercher des fichiers dans OneDrive par nom ou contenu. Renvoie nom, type et id.",
  inputSchema: {
    type: "object",
    required: ["query"],
    properties: {
      query: { type: "string", description: "Texte à chercher." },
      limit: { type: "number", description: "Nombre de résultats (défaut 15, max 40)." },
    },
  },
  async run(args, ctx: ConnectorToolCtx) {
    const query = str(args.query);
    if (!query) return { content: [{ type: "text", text: "query requis." }], isError: true };
    const limit = clampLimit(args.limit, 15, 40);
    const res = await ctx.fetchJson<{ value?: DriveItem[] }>(
      `${GRAPH}/me/drive/root/search(q='${encodeURIComponent(q(query))}')?$top=${limit}`,
    );
    const rows = (res.value ?? []).map((f) => {
      const kind = f.folder ? "dossier" : f.file?.mimeType ?? "fichier";
      const when = f.lastModifiedDateTime ? ` (${f.lastModifiedDateTime.slice(0, 10)})` : "";
      return `${f.name ?? "(sans nom)"} — ${kind}${when} · id:${f.id}`;
    });
    return { content: [{ type: "text", text: rows.join("\n") || "Aucun fichier." }] };
  },
};

const readDocument: ConnectorTool = {
  name: "read_document",
  description:
    "Lire le contenu texte d'un fichier OneDrive par son id (fichiers texte / documents lisibles en texte).",
  inputSchema: {
    type: "object",
    required: ["itemId"],
    properties: { itemId: { type: "string", description: "L'id du fichier (voir search_files)." } },
  },
  async run(args, ctx: ConnectorToolCtx) {
    const itemId = str(args.itemId);
    if (!itemId) return { content: [{ type: "text", text: "itemId requis." }], isError: true };
    const raw = await ctx.fetchText(`${GRAPH}/me/drive/items/${encodeURIComponent(assertFileId(itemId))}/content`);
    const text = raw.length > MAX_CHARS ? `${raw.slice(0, MAX_CHARS)}\n…(tronqué)` : raw;
    return { content: [{ type: "text", text: text || "(vide ou non lisible en texte)" }] };
  },
};

/**
 * A 404 on the ROOT or on a search names no item: Graph answers it when the account has no
 * OneDrive provisioned (a work account without the licence, one never opened). The model got
 * a bare « (404) » and retried; it now knows what to tell the user. Same diagnosis as the
 * Folders panel (`main/cloudfs`). A 404 with a folder/item id stays « that id is wrong ».
 */
export function onedriveErrorHint(err: unknown): string {
  const m = err instanceof Error ? err.message : String(err);
  if (!/\(404\)/.test(m)) return m;
  return (
    `${m} — sur la racine ou une recherche, cela signifie que ce compte Microsoft n'a pas ` +
    `encore d'espace OneDrive : dis à l'utilisateur d'ouvrir OneDrive une fois avec ce compte ` +
    `(onedrive.com) ou de vérifier sa licence OneDrive. Sur un id précis, l'id est inconnu. ` +
    `Ne réessaie pas en boucle.`
  );
}

export const microsoftOneDriveConnector: Connector = {
  id: "microsoft-onedrive",
  name: "OneDrive",
  auth: "microsoft",
  // Files.ReadWrite = delegated, no admin consent → 1-clic; byo widens to all files.
  // A connection granted only `Files.Read` keeps reading, without `upload_file`.
  scopes: { managed: ["Files.ReadWrite"], byo: ["Files.ReadWrite.All"] },
  tools: [searchFiles, listFolder, readDocument, onedriveUploadFile],
  errorHint: onedriveErrorHint,
};
