import type { McpConnection, McpToolResult } from "@openmasq/mcp";
import { sortRemote, type RemoteEntry } from "@openmasq/connectors";
import { findFolderLister, isFolderListTool, listerFor, type FolderLister } from "./lister";
import { asRecord, describeShape, parseToolList, readJson } from "./read";

/**
 * Parcourir un stockage dont nous n'écrivons PAS l'appel — un serveur MCP distant
 * (Dropbox) — en passant par l'outil de listage qu'il expose lui-même.
 *
 * Drive et OneDrive sont des connecteurs DIRECTS : nous construisons l'URL, donc la forme
 * de la réponse est un contrat que nous tenons (`cloudfs/providers.ts`). Dropbox n'est
 * atteignable que par `https://mcp.dropbox.com/mcp`, et son `ListFolder` est le seul
 * listage qui existe. D'où la posture de ce module, qui est l'inverse d'une devinette :
 *
 *  - **`lister.ts` ne devine rien** : nom d'outil et argument de dossier en allow-list, le
 *    second choisi DANS le schéma déclaré. Tout le reste de ce que le serveur expose —
 *    écritures comprises — est inatteignable d'ici.
 *  - **`read.ts` échoue FERMÉ** : du JSON, et seulement s'il porte de quoi nommer ET classer
 *    chaque entrée. Sinon la source reprend sa ligne d'état, avec l'EMPREINTE de ce qu'on a
 *    reçu (des clés, jamais des valeurs) — un refus sans diagnostic est un mur.
 *
 * ⚠️ Ce que ça n'élargit PAS : lecture seule, aucun octet de contenu, aucun scope de plus
 * que ceux déjà accordés à la connexion. Le renderer peut déjà appeler
 * `mcp.callTool("dropbox__ListFolder")` et recevoir les vrais noms — ce qui change ici est
 * la FORME (typée pour une interface), pas la portée.
 */

/** Un identifiant de dossier vient du RENDERER. Il ne compose ici aucune URL — il devient
 *  un argument JSON que le serveur interprète — donc la garde est un plancher d'hygiène :
 *  bornée, sans caractère de contrôle. La racine est la chaîne vide, ce qu'attend Dropbox. */
export function assertFolderRef(ref: string | null): string {
  const s = ref ?? "";
  if (s.length > 1024) throw new Error("Chemin de dossier trop long.");
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f]/.test(s)) throw new Error("Chemin de dossier invalide.");
  return s;
}

/** Bornes de pagination : de quoi couvrir un vrai dossier sans boucler sur un serveur
 *  qui rendrait toujours `has_more`. Atteindre la borne TRONQUE — c'est le seul endroit
 *  où la liste peut être incomplète, et c'est dit ici plutôt que silencieux. */
const MAX_PAGES = 20;
const MAX_ENTRIES = 2000;

/** Les parties TEXTE d'un résultat — y compris celles qu'un serveur emballe en `resource`,
 *  qui est le même texte sous un autre nom. */
const textsOf = (content: McpToolResult["content"]): string[] =>
  content.flatMap((c) => {
    if (c.type === "text" && typeof c.text === "string") return [c.text];
    const res = c.type === "resource" ? asRecord((c as { resource?: unknown }).resource) : null;
    return typeof res?.text === "string" ? [res.text] : [];
  });

/** Le dossier d'un identifiant-CHEMIN (`/a/b.pdf` → `/a`, la racine → `/`). */
const parentOf = (p: string): string => p.slice(0, p.lastIndexOf("/")) || "/";

/**
 * Ne garder que les enfants DIRECTS du dossier demandé.
 *
 * ⚠️ Un `ListFolder` distant peut répondre RÉCURSIVEMENT : le petit-fils arrive alors à
 * côté de son parent, dans le même listing. L'arbre rend ce qu'on lui donne — le fichier
 * s'affichait donc à la racine ET dans son dossier, et replier le dossier n'enlevait rien
 * puisque l'autre ligne n'y était pour rien. C'est ici que ça se coupe, pas à l'écran :
 * un listing doit décrire UN dossier.
 *
 * Ne s'applique qu'aux identifiants en forme de CHEMIN — un fileId Drive ou un itemId Graph
 * est opaque, on ne peut rien en déduire, donc on n'y touche pas.
 */
export function directChildren(folder: string, entries: readonly RemoteEntry[]): RemoteEntry[] {
  const base = folder === "" || folder === "/" ? "/" : folder.replace(/\/+$/, "");
  return entries.filter((e) => !e.id.startsWith("/") || parentOf(e.id) === base);
}

/** Le contenu d'un dossier distant, via l'outil du serveur. Lève quand ce n'est pas
 *  lisible : l'appelant en fait « ce stockage ne se parcourt pas ». */
export async function mcpBrowseList(
  conn: McpConnection,
  folderRef: string | null,
): Promise<RemoteEntry[]> {
  const lister = await listerFor(conn);
  if (!lister) throw new Error("Ce stockage n'expose pas de listage de dossier.");
  const folder = assertFolderRef(folderRef);
  const entries: RemoteEntry[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    // Le dossier accompagne TOUJOURS le curseur : un outil dont le chemin est obligatoire
    // refuserait une page de suite qui ne porterait que le curseur.
    const args: Record<string, string> = { [lister.folderArg]: folder };
    if (cursor && lister.cursorArg) args[lister.cursorArg] = cursor;
    const res = await conn.callTool({ name: lister.tool, arguments: args });
    if (res.isError) throw new Error("Ce dossier n'a pas pu être listé.");
    const texts = textsOf(res.content);
    const parsed = parseToolList(texts);
    // L'empreinte accompagne le refus : sans elle, personne ne peut savoir CE QUI manque.
    if (!parsed) throw new Error(`Ce stockage ne rend pas de liste exploitable — ${describeShape(texts)}.`);
    let neuf = 0;
    for (const e of directChildren(folder, parsed.entries)) {
      // Un identifiant déjà vu ne rentre pas deux fois — un serveur qui IGNORE notre
      // curseur re-servirait sinon la même page vingt fois, en doublons.
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      entries.push(e);
      neuf++;
    }
    cursor = parsed.cursor;
    // Une page qui n'apporte RIEN de neuf arrête la pagination : c'est la signature d'un
    // curseur ignoré, et insister ne ferait que repayer le même aller-retour.
    if (!cursor || !lister.cursorArg || !neuf || entries.length >= MAX_ENTRIES) break;
  }
  return sortRemote(entries.slice(0, MAX_ENTRIES));
}

// Ce que le barrel expose VRAIMENT : le reste est importé directement depuis
// `./lister` / `./read` par ses consommateurs, et le ré-exporter ne créait que du
// code inatteignable.
export { findFolderLister, isFolderListTool } from "./lister";
export { describeShape, parseToolList } from "./read";
