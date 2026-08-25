import { listServers } from "../mcp/persist";
import { connected, routes } from "../mcp/server/registry";
import { directFetchJson } from "../mcp/connectors";
import { isFolderListTool, mcpBrowseList } from "./mcpBrowse";
import { CLOUD_PROVIDERS, MCP_BROWSABLE, type CloudEntry } from "./providers";

/**
 * Parcourir un stockage connecté (Google Drive, OneDrive, Dropbox) depuis l'interface.
 *
 * Pourquoi ce n'est pas `mcp.callTool` — la même raison que pour les dossiers locaux
 * (`ipc/registerLocalFsIpc.ts`) : les outils d'un connecteur rendent de la PROSE pour un
 * modèle (`nom — type (date) · id:…`), et le panneau a besoin d'une liste typée. Même
 * compte, même jeton, même pare-feu — une forme faite pour une interface.
 *
 * SÉCURITÉ — ce que ça élargit, et ce que ça n'élargit pas :
 *  - **Lire est de la PARITÉ.** Le renderer peut déjà appeler
 *    `mcp.callTool("google-drive__search_files")` et recevoir les vrais noms. Ceci ajoute
 *    une forme, pas une portée : aucune écriture, aucun octet de contenu, aucun scope
 *    supplémentaire — les mêmes que ceux que l'utilisateur a accordés à l'OAuth.
 *  - **Le connecteur visé est en LISTE BLANCHE** (`CLOUD_PROVIDERS` pour un appel direct,
 *    `MCP_BROWSABLE` pour un serveur distant) et doit être CONNECTÉ. Un connecteur qui
 *    n'est pas un stockage n'est pas atteignable par ici, même si le renderer envoie son id.
 *  - **Deux régimes, une seule sortie.** Drive et OneDrive : nous construisons l'URL. Dropbox :
 *    nous appelons SON outil de listage, dont le nom est lui aussi en allow-list et dont la
 *    réponse est relue fermé (`mcpBrowse.ts`). Dans les deux cas, lister et rien d'autre.
 *  - **L'id de dossier est validé avant d'entrer dans une URL** (`assertCloudId`) : c'est
 *    la seule valeur que le renderer choisit.
 *  - **Le jeton ne quitte jamais main.** `directFetchJson` le résout (et le rafraîchit),
 *    applique le plancher SSRF et refuse de suivre une redirection authentifiée.
 *  - **Connecteur absent ⇒ capacité absente** : la source n'est pas listée, plutôt qu'une
 *    racine inventée.
 */

export interface CloudSource {
  /** L'id d'INSTANCE du serveur (multi-compte : `google-drive--2`). */
  id: string;
  /** L'id de catalogue — ce qui décide du fournisseur et du logo. */
  connectorId: string;
  /** Le compte, quand le connecteur a su le nommer. */
  label?: string;
}

const connectorIdOf = (specId: string, stored?: string): string => {
  if (stored) return stored;
  const i = specId.indexOf("--");
  return i > 0 ? specId.slice(0, i) : specId;
};

/** Un serveur distant expose-t-il un listage de dossier ? Lu dans la table de ROUTAGE, que
 *  main tient déjà à jour — annoncer navigable un compte qui ne l'est pas donnerait un
 *  chevron qui ne mène nulle part. */
function exposesLister(serverId: string): boolean {
  const prefix = `${serverId}__`;
  for (const name of routes.keys()) if (name.startsWith(prefix) && isFolderListTool(name)) return true;
  return false;
}

/** Les stockages connectés que l'on sait parcourir. */
export function cloudSources(): CloudSource[] {
  return listServers()
    .map((s) => ({ id: s.id, connectorId: connectorIdOf(s.id, s.connectorId), label: s.label }))
    .filter(
      (s) =>
        connected.has(s.id) &&
        (!!CLOUD_PROVIDERS[s.connectorId] ||
          (MCP_BROWSABLE.has(s.connectorId) && exposesLister(s.id))),
    );
}

/** Le contenu d'un dossier (racine du compte si `folderId` est absent). */
export async function cloudList(
  instanceId: string,
  folderId: string | null,
): Promise<{ entries: CloudEntry[] }> {
  // On repart de la liste des sources : elle porte déjà les deux vérifications (c'est un
  // stockage connu, il est connecté). Un id qui n'y est pas n'atteint aucune URL.
  const source = cloudSources().find((s) => s.id === instanceId);
  if (!source) throw new Error("Ce stockage n'est pas connecté.");
  const provider = CLOUD_PROVIDERS[source.connectorId];
  if (!provider) {
    // Serveur distant : son propre outil de listage. `connected` a déjà servi de garde
    // au-dessus, donc la connexion existe.
    const conn = connected.get(source.id)!;
    return { entries: await mcpBrowseList(conn, folderId) };
  }
  const body = await directFetchJson<unknown>(source.id, provider.childrenUrl(folderId));
  return { entries: provider.parse(body) };
}
