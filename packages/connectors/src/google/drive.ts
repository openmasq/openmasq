import { BRAND } from "@openmasq/branding";
import type { Connector, ConnectorTool, } from "../types";
import {
  assertFileId,
  readAttachments,
  remoteTime,
  renderRemoteList,
  sortRemote,
  type RemoteEntry,
} from "../files";
import { googleApiErrorHint } from "./googleApiError";

/**
 * Google Drive — lire tout le Drive, et DÉPOSER des fichiers.
 *
 * Deux scopes, chacun taillé sur ses outils : `drive.readonly` (**RESTRICTED**) pour
 * chercher/lister/lire partout, et `drive.file` (NON sensible) pour l'écriture —
 * l'app ne peut créer et retoucher QUE ses propres fichiers, jamais modifier un
 * document existant du Drive. C'est le choix qui donne l'écriture sans élargir la
 * surface restreinte (vérification Google/CASA). Output is redacted downstream.
 */
const API = "https://www.googleapis.com/drive/v3";
const MAX_CHARS = 50_000;
const APPS = "application/vnd.google-apps.";

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
}

/** Escape single quotes for a Drive `q` string literal. */
const q = (s: string): string => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

function clampLimit(v: unknown, def: number, max: number): number {
  const n = typeof v === "number" ? Math.floor(v) : def;
  return Math.max(1, Math.min(max, n));
}

/**
 * Lister le contenu d'un dossier — construit ici, consommé DEUX fois : par l'outil
 * ci-dessous et par le panneau « Dossiers » de l'app (`main/cloudfs`). Une seule URL, une
 * seule relecture, donc l'écran et le modèle voient le même Drive.
 */
export function driveChildrenUrl(folderId: string | null): string {
  // `root` est l'alias Drive de « Mon Drive » : aucun id spécial à inventer.
  const parent = folderId ? assertFileId(folderId) : "root";
  const filter = `'${parent}' in parents and trashed = false`;
  return (
    `${API}/files?q=${encodeURIComponent(filter)}&pageSize=200` +
    `&fields=${encodeURIComponent("files(id,name,mimeType,modifiedTime)")}&orderBy=folder,name`
  );
}

export function parseDriveChildren(body: unknown): RemoteEntry[] {
  const files = (body as { files?: DriveFile[] })?.files ?? [];
  return sortRemote(
    files
      .filter((f): f is DriveFile & { id: string; name: string } => !!f.id && !!f.name)
      .map((f) => ({
        id: f.id,
        name: f.name,
        kind: f.mimeType === `${APPS}folder` ? ("dir" as const) : ("file" as const),
        mtime: remoteTime(f.modifiedTime),
      })),
  );
}

const listFolder: ConnectorTool = {
  name: "list_folder",
  description:
    "Lister le contenu d'un dossier Drive (le dossier racine par défaut). Renvoie noms et ids ; utilise l'id d'un dossier pour descendre.",
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
    const body = await ctx.fetchJson<unknown>(driveChildrenUrl(folderId));
    return { content: [{ type: "text", text: renderRemoteList(parseDriveChildren(body)) }] };
  },
};

const searchFiles: ConnectorTool = {
  name: "search_files",
  description:
    "Rechercher des fichiers dans Google Drive par nom ou contenu. Renvoie nom, type et date.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Texte à chercher dans le nom ou le contenu." },
      limit: { type: "number", description: "Nombre de résultats (défaut 15, max 40)." },
    },
    required: ["query"],
  },
  async run(args, ctx) {
    const query = typeof args.query === "string" ? args.query.trim() : "";
    const limit = clampLimit(args.limit, 15, 40);
    const filter = query
      ? `(name contains '${q(query)}' or fullText contains '${q(query)}') and trashed = false`
      : "trashed = false";
    const url =
      `${API}/files?q=${encodeURIComponent(filter)}&pageSize=${limit}` +
      `&orderBy=modifiedTime desc&fields=${encodeURIComponent("files(id,name,mimeType,modifiedTime)")}`;
    const res = await ctx.fetchJson<{ files?: DriveFile[] }>(url);
    const files = res.files ?? [];
    if (files.length === 0) return { content: [{ type: "text", text: "Aucun fichier." }] };
    const rows = files.map(
      (f) => `${f.name} — ${f.mimeType.replace(APPS, "google-")}${f.modifiedTime ? ` (${f.modifiedTime.slice(0, 10)})` : ""} · id:${f.id}`,
    );
    return { content: [{ type: "text", text: rows.join("\n") }] };
  },
};

/** Pick how to fetch a file's text from its mime type — or null if not text-readable. */
function textUrlFor(fileId: string, mimeType: string): string | null {
  if (mimeType.startsWith(APPS)) {
    const kind = mimeType.slice(APPS.length);
    if (kind === "document" || kind === "presentation")
      return `${API}/files/${fileId}/export?mimeType=text/plain`;
    if (kind === "spreadsheet") return `${API}/files/${fileId}/export?mimeType=text/csv`;
    return null; // folder / form / drawing → nothing to read as text
  }
  if (mimeType.startsWith("text/") || mimeType === "application/json")
    return `${API}/files/${fileId}?alt=media`;
  return null;
}

const readDocument: ConnectorTool = {
  name: "read_document",
  description:
    "Lire le texte d'un fichier Drive par son id (Google Docs/Sheets/Slides ou fichier texte).",
  inputSchema: {
    type: "object",
    properties: { fileId: { type: "string", description: "L'id du fichier (voir search_files)." } },
    required: ["fileId"],
  },
  async run(args, ctx) {
    const fileId = typeof args.fileId === "string" ? args.fileId.trim() : "";
    if (!fileId) return { content: [{ type: "text", text: "fileId requis." }], isError: true };
    const meta = await ctx.fetchJson<DriveFile>(
      `${API}/files/${fileId}?fields=${encodeURIComponent("id,name,mimeType")}`,
    );
    const url = textUrlFor(fileId, meta.mimeType);
    if (!url) {
      return {
        content: [{ type: "text", text: `« ${meta.name} » (${meta.mimeType}) n'est pas lisible en texte.` }],
        isError: true,
      };
    }
    const raw = await ctx.fetchText(url);
    const text = raw.length > MAX_CHARS ? `${raw.slice(0, MAX_CHARS)}\n…(tronqué)` : raw;
    return { content: [{ type: "text", text: `# ${meta.name}\n\n${text}` }] };
  },
};


/** Frontière du multipart — pure et exportée pour le test : un upload Drive est un
 *  `multipart/related` métadonnées JSON + octets base64, et une bordure mal fermée
 *  donne un 400 Google qui ne dit pas pourquoi. */
export function buildDriveUpload(
  meta: { name: string; parents?: string[] },
  mimeType: string,
  contentBase64: string,
  boundary: string,
): string {
  return (
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(meta)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${mimeType || "application/octet-stream"}\r\n` +
    `Content-Transfer-Encoding: base64\r\n\r\n` +
    `${contentBase64}\r\n` +
    `--${boundary}--`
  );
}

const uploadFile: ConnectorTool = {
  name: "upload_file",
  // `drive.file` : listé seulement quand l'ÉCRITURE a été accordée — une connexion
  // d'avant reste lecture seule jusqu'à reconnexion (consentement incrémental).
  scope: "https://www.googleapis.com/auth/drive.file",
  description:
    "Déposer un fichier sur le Google Drive de l'utilisateur. Deux sources, une seule à la fois : " +
    "`file` = le NOM d'un document de la conversation (le fichier original est déposé tel quel) ; " +
    "`text` = un contenu que tu écris (avec `name` obligatoire, ex. « notes.md »). " +
    "`folderId` (optionnel) cible un dossier — voir list_folder/search_files ; absent = la racine. " +
    "Ne peut PAS modifier un fichier existant du Drive. " +
    // ⚠️ Dire ce qui MANQUE, pas seulement ce qui existe (parcours notaire, 17/08) : le
    // dossier demandé n'existait pas, et le modèle a annoncé que « l'intégration ne permet
    // pas » de sauvegarder — alors que CET outil était exposé. Le FAIT manquait ; la
    // conduite à tenir, elle, n'est PAS tranchée ici (déposer à la racine ou refuser et
    // instruire sont deux réponses défendables — registre, `À trancher`), donc cette phrase
    // se garde d'en prescrire une.
    "Aucun outil ne CRÉE de dossier sur le Drive.",
  inputSchema: {
    type: "object",
    properties: {
      file: {
        type: "string",
        description: "Nom d'un document de la conversation à déposer (fichier original).",
      },
      name: { type: "string", description: "Nom du fichier créé (requis avec `text`)." },
      text: { type: "string", description: "Contenu texte à déposer (exclusif avec `file`)." },
      folderId: { type: "string", description: "Id du dossier cible (absent = racine)." },
    },
  },
  async run(args, ctx) {
    const att = readAttachments((args as Record<string, unknown>).__attachmentData)[0];
    const text = typeof args.text === "string" && args.text ? args.text : null;
    if (!att && text === null) {
      return {
        content: [{ type: "text", text: "Indique `file` (un document de la conversation) OU `text` (+ `name`)." }],
        isError: true,
      };
    }
    const name =
      (typeof args.name === "string" && args.name.trim()) || att?.filename || "";
    if (!name) {
      return { content: [{ type: "text", text: "`name` est obligatoire avec `text`." }], isError: true };
    }
    const folderId =
      typeof args.folderId === "string" && args.folderId.trim() ? assertFileId(args.folderId.trim()) : null;
    const meta = { name, ...(folderId ? { parents: [folderId] } : {}) };
    const mime = att?.mimeType || "text/plain";
    const b64 = att?.contentBase64 ?? Buffer.from(text ?? "", "utf8").toString("base64");
    const boundary = `${BRAND.slug}_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
    try {
      const res = await ctx.fetchJson<{ id?: string; name?: string }>(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name",
        {
          method: "POST",
          headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
          body: buildDriveUpload(meta, mime, b64, boundary),
        },
      );
      return {
        content: [
          { type: "text", text: `Fichier déposé sur Drive : « ${res.name ?? name} » (id ${res.id ?? "?"}).` },
        ],
      };
    } catch (err) {
      const hint = googleApiErrorHint(err, {
        api: "API Google Drive",
        connector: "Google Drive",
        scope: "le DÉPÔT de fichiers (autorisation d'écriture — reconnectez le compte)",
        fallback: "Dépôt sur Google Drive impossible",
      });
      return { content: [{ type: "text", text: hint }], isError: true };
    }
  },
};

export const googleDriveConnector: Connector = {
  id: "google-drive",
  name: "Google Drive",
  auth: "pkce",
  // ⚠️ CETTE liste est celle que l'OAuth demande (`main/mcp/connectors/index.ts`) ; le
  // catalogue en porte une copie d'affichage — `scopesParity.test.ts` les tient égales.
  // `drive.file` donne l'écriture SANS élargir la surface restreinte (voir l'en-tête).
  scopes: {
    managed: ["https://www.googleapis.com/auth/drive.readonly", "https://www.googleapis.com/auth/drive.file"],
    byo: ["https://www.googleapis.com/auth/drive.readonly", "https://www.googleapis.com/auth/drive.file"],
  },
  tools: [searchFiles, listFolder, readDocument, uploadFile],
  // Applied by the adapter to EVERY call (`run.ts`), so a tool added later
  // cannot forget it — the reason this lives on the connector, not per tool.
  errorHint: (err) =>
    googleApiErrorHint(err, {
      api: "API Google Drive",
      connector: "Google Drive",
      scope: "la LECTURE de vos fichiers Drive",
      fallback: "Lecture Google Drive impossible",
    }),
};
