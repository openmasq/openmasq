import type { ConnectorTool } from "../types";
import { assertFileId, readAttachments } from "../files";
import { GRAPH } from "./graph";

/** Graph's simple upload (`PUT …:/content`) takes at most 4 MB; above, it needs an upload
 *  session. Refused up front with a sentence, rather than a 413 nobody can act on. */
export const ONEDRIVE_SIMPLE_UPLOAD_MAX = 4 * 1024 * 1024;

/** The characters OneDrive refuses in a name (`" * : < > ? / \ |`), and a leading or
 *  trailing dot/space — replaced, so a model-chosen name can never become a PATH. */
export function onedriveSafeName(name: string): string {
  const cleaned = name.replace(/["*:<>?/\\|\u0000-\u001f]/g, "_").replace(/^[\s.]+|[\s.]+$/g, "");
  return cleaned || "fichier";
}

/**
 * The simple-upload URL: into a folder (`folderId`, validated) or the drive root.
 * `conflictBehavior=rename`: a file of the same name is NEVER overwritten — OneDrive adds
 * « (1) ». The tool creates; it does not modify. Pure, exported for the test.
 */
export function onedriveUploadUrl(name: string, folderId: string | null): string {
  const safe = encodeURIComponent(onedriveSafeName(name));
  const at = folderId ? `/items/${encodeURIComponent(assertFileId(folderId))}:/${safe}:/content` : `/root:/${safe}:/content`;
  return `${GRAPH}/me/drive${at}?@microsoft.graph.conflictBehavior=rename`;
}

const reply = (text: string, isError = false) => ({ content: [{ type: "text" as const, text }], ...(isError ? { isError } : {}) });

export const onedriveUploadFile: ConnectorTool = {
  name: "upload_file",
  // Listed only when WRITE was granted (`Files.ReadWrite`, or `.All` in « Mes clés »): a
  // connection made read-only before stays so until it is reconnected.
  scope: "Files.ReadWrite",
  description:
    "Déposer un fichier sur le OneDrive de l'utilisateur. Deux sources, une seule à la fois : " +
    "`file` = le NOM d'un document de la conversation, y compris un fichier que tu as généré " +
    "(le fichier original est déposé tel quel) ; `text` = un contenu que tu écris (avec `name` " +
    "obligatoire, ex. « notes.md »). `folderId` (optionnel) cible un dossier — voir " +
    "list_folder/search_files ; absent = la racine. Ne remplace JAMAIS un fichier existant " +
    "(un homonyme est renommé). 4 Mo maximum. Aucun outil ne CRÉE de dossier sur OneDrive.",
  inputSchema: {
    type: "object",
    properties: {
      file: { type: "string", description: "Nom d'un document de la conversation à déposer (fichier original)." },
      name: { type: "string", description: "Nom du fichier créé (requis avec `text`)." },
      text: { type: "string", description: "Contenu texte à déposer (exclusif avec `file`)." },
      folderId: { type: "string", description: "Id du dossier cible (absent = racine)." },
    },
  },
  async run(args, ctx) {
    const att = readAttachments((args as Record<string, unknown>).__attachmentData)[0];
    const text = typeof args.text === "string" && args.text ? args.text : null;
    if (!att && text === null) return reply("Indique `file` (un document de la conversation) OU `text` (+ `name`).", true);
    const name = (typeof args.name === "string" && args.name.trim()) || att?.filename || "";
    if (!name) return reply("`name` est obligatoire avec `text`.", true);
    const bytes = att ? Buffer.from(att.contentBase64, "base64") : Buffer.from(text ?? "", "utf8");
    if (bytes.length > ONEDRIVE_SIMPLE_UPLOAD_MAX)
      return reply(`« ${name} » dépasse 4 Mo : trop volumineux pour un dépôt direct sur OneDrive.`, true);
    const folderId = typeof args.folderId === "string" && args.folderId.trim() ? args.folderId.trim() : null;
    try {
      const res = await ctx.fetchJson<{ id?: string; name?: string }>(onedriveUploadUrl(name, folderId), {
        method: "PUT",
        headers: { "Content-Type": att?.mimeType || "text/plain; charset=utf-8" },
        body: bytes,
      });
      // `· id:` closes the line like every listing: the id stays real (`integrationKeep.ts`).
      return reply(`Fichier déposé sur OneDrive : « ${res?.name ?? name} » · id:${res?.id ?? "?"}`);
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      // 403 = the token reads but may not write: an older, read-only connection.
      if (/\(403\)/.test(m))
        return reply("Dépôt refusé par OneDrive (403) : la connexion n'autorise que la lecture. Reconnecte OneDrive (Réglages → Connecteurs) pour autoriser l'écriture.", true);
      return reply(`Dépôt sur OneDrive impossible : ${m}`, true);
    }
  },
};
