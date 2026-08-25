import {
  driveChildrenUrl,
  onedriveChildrenUrl,
  parseDriveChildren,
  parseOnedriveChildren,
  type RemoteEntry,
} from "@openmasq/connectors";

/**
 * Les stockages que l'app sait PARCOURIR — un aiguillage, pas une implémentation.
 *
 * Construire l'URL et relire la réponse vit dans `@openmasq/connectors`, avec l'outil
 * `list_folder` que le modèle appelle : le panneau et le modèle listent le même compte, il
 * n'y a donc qu'un seul code pour dire comment. La validation de l'identifiant est là-bas
 * aussi (`assertFileId`) — les deux appelants la traversent.
 *
 * ⚠️ ALLOW-list : un connecteur absent des DEUX listes n'est pas navigable, quoi qu'il
 * expose par ailleurs.
 */
export type CloudEntry = RemoteEntry;

export interface CloudProvider {
  childrenUrl(folderId: string | null): string;
  parse(body: unknown): CloudEntry[];
}

export const CLOUD_PROVIDERS: Record<string, CloudProvider> = {
  "google-drive": { childrenUrl: driveChildrenUrl, parse: parseDriveChildren },
  "microsoft-onedrive": { childrenUrl: onedriveChildrenUrl, parse: parseOnedriveChildren },
};

/**
 * Les stockages qui n'ont PAS d'appel direct chez nous et se parcourent par l'outil de
 * listage de leur propre serveur MCP (`mcpBrowse.ts`).
 *
 * ⚠️ Y figurer ne suffit pas : le serveur doit RÉELLEMENT exposer un listage en allow-list
 * et en rendre du JSON classable. Sinon la source garde sa ligne d'état — un chevron qui ne
 * mène nulle part serait pire que pas de chevron.
 */
export const MCP_BROWSABLE = new Set(["dropbox"]);
