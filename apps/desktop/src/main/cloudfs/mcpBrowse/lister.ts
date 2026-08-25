/**
 * DÉCOUVRIR l'outil de listage d'un serveur distant — la moitié qui n'invente rien.
 *
 * Le NOM de l'outil est en allow-list : un serveur n'obtient pas ce chemin parce qu'il se
 * dit stockage, mais parce qu'il expose un outil dont le nom y figure. Tout le reste de ce
 * qu'il expose — écritures comprises — est inatteignable d'ici. L'argument de dossier est
 * lui aussi en allow-list, et il est choisi DANS le schéma déclaré, jamais deviné.
 */
import type { McpConnection, McpTool } from "@openmasq/mcp";

/** `dropbox__ListFolder` → `listfolder` : le préfixe d'instance et la casse ne sont pas
 *  des informations, seul le nom de l'outil en est une. */
const norm = (name: string): string => {
  const bare = name.includes("__") ? name.slice(name.lastIndexOf("__") + 2) : name;
  return bare.toLowerCase().replace(/[^a-z]/g, "");
};

/** ALLOW-LIST — lister le contenu d'un dossier, et rien d'autre. */
const LIST_TOOLS = new Set(["listfolder", "listfolders", "listfiles", "listdirectory", "listdir"]);

/** ALLOW-LIST — l'argument qui désigne le dossier à lister. */
const FOLDER_ARGS = new Set(["path", "folder", "folderpath", "folderid", "directory", "dir"]);

/** ALLOW-LIST — l'argument de pagination, quand l'outil en déclare un. */
const CURSOR_ARGS = new Set(["cursor", "pagetoken", "nexttoken", "continuationtoken"]);

/** Ce nom d'outil est-il un listage de dossier ? La question que `cloudSources()` pose à la
 *  table de ROUTAGE déjà en mémoire, pour n'annoncer navigable qu'un compte qui l'est —
 *  sans un aller-retour réseau par ligne. */
export const isFolderListTool = (name: string): boolean => LIST_TOOLS.has(norm(name));

export interface FolderLister {
  /** Le nom RÉEL de l'outil sur le serveur (non préfixé). */
  tool: string;
  /** L'argument qui porte le dossier. */
  folderArg: string;
  /** L'argument de pagination, si l'outil en déclare un. */
  cursorArg?: string;
}

type Schema = { properties?: Record<string, unknown>; required?: unknown };

/**
 * L'outil de listage d'un serveur, ou `null` s'il n'en expose aucun d'utilisable.
 *
 * « Utilisable » exclut un outil qui exige un argument que nous ne savons pas remplir :
 * l'appeler à moitié rendrait une erreur du serveur là où « ce compte ne se parcourt pas »
 * est la réponse honnête.
 */
export function findFolderLister(tools: McpTool[]): FolderLister | null {
  for (const t of tools) {
    if (!LIST_TOOLS.has(norm(t.name))) continue;
    const schema = (t.inputSchema ?? {}) as Schema;
    const props = Object.keys(schema.properties ?? {});
    const folderArg = props.find((p) => FOLDER_ARGS.has(norm(p)));
    if (!folderArg) continue;
    const cursorArg = props.find((p) => CURSOR_ARGS.has(norm(p)));
    const required = Array.isArray(schema.required) ? (schema.required as string[]) : [];
    const unfillable = required.filter((r) => r !== folderArg && r !== cursorArg);
    if (unfillable.length) continue;
    return { tool: t.name, folderArg, ...(cursorArg ? { cursorArg } : {}) };
  }
  return null;
}

const listerCache = new WeakMap<McpConnection, FolderLister | null>();

/** L'outil de listage d'une connexion, mémorisé — une reconnexion crée un autre objet,
 *  donc le cache se vide de lui-même quand la connexion change. */
export async function listerFor(conn: McpConnection): Promise<FolderLister | null> {
  const hit = listerCache.get(conn);
  if (hit !== undefined) return hit;
  const found = findFolderLister(await conn.listTools());
  listerCache.set(conn, found);
  return found;
}
