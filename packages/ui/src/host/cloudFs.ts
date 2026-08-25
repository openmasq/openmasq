/**
 * Parcours OPTIONNEL d'un stockage connecté — le pendant distant de {@link LocalFsHost}
 * pour les fichiers qui ne sont pas sur cette machine (Google Drive, OneDrive, Dropbox).
 *
 * POURQUOI PAS `mcp.callTool`. La même raison que pour les dossiers locaux : les outils
 * d'un connecteur rendent de la prose faite pour un modèle (`nom — type (date) · id:…`),
 * chaque appel passe par le coffre de la conversation — or ce panneau doit montrer à
 * l'utilisateur SES vrais fichiers (la règle 11 gouverne ce que voit le modèle, rien
 * d'autre). Même compte, même jeton, même pare-feu ; une forme faite pour une interface.
 *
 * ABSENT ⇒ DÉGRADER. Pas de slot (aperçu web, mobile) ou aucune source ⇒ le groupe n'est
 * pas dessiné. C'est un confort, pas une garantie que l'utilisateur a choisie.
 *
 * LECTURE SEULE, ET SEULEMENT LISTER. Aucun octet de contenu ne transite par ici : lire un
 * document distant reste l'affaire du modèle et de ses outils. Le jeton OAuth ne quitte
 * jamais le processus principal, et l'id de dossier que passe le renderer est validé
 * là-bas avant d'entrer dans une URL de fournisseur.
 */
export interface CloudEntry {
  /** L'identifiant du fournisseur, opaque pour l'interface : un fileId Drive, un itemId
   *  Graph, un chemin Dropbox. Il se repasse tel quel, il ne se compose pas. */
  id: string;
  name: string;
  kind: "dir" | "file";
  /** Epoch ms ; 0 quand le fournisseur ne l'a pas donné. */
  mtime: number;
}

/** Un compte de stockage connecté et parcourable. */
export interface CloudSource {
  /** L'id d'INSTANCE (multi-compte : `google-drive--2`) — à repasser tel quel. */
  id: string;
  /** L'id de catalogue : ce qui décide du logo et du nom affichés. */
  connectorId: string;
  /** Le compte, quand le connecteur a su le nommer. */
  label?: string;
}

export interface CloudFsHost {
  /** Les stockages connectés que l'app sait parcourir. Vide = rien à montrer. */
  sources(): Promise<{ sources: CloudSource[] }>;
  /** Le contenu d'un dossier ; `folderId` à `null` = la racine du compte. */
  list(sourceId: string, folderId: string | null): Promise<{ entries: CloudEntry[] }>;
}
