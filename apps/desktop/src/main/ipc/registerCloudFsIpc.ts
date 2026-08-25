import { ipcMain } from "electron";
import { cloudList, cloudSources } from "../cloudfs";

/**
 * `cloudfs:*` — parcourir un stockage connecté (Drive, OneDrive, Dropbox) depuis le panneau
 * « Dossiers », en regard des dossiers locaux.
 *
 * Le pourquoi et la posture de sécurité vivent avec le code qu'ils gouvernent :
 * `../cloudfs/index.ts`. Ici, deux règles de la maison seulement :
 *  - **une ENVELOPPE plutôt qu'un throw** : `ipcRenderer.invoke` transforme une erreur en
 *    « Error invoking remote method … », et le panneau doit montrer la vraie raison
 *    (« ce stockage n'est pas connecté ») ;
 *  - **aucun secret dans la réponse** : des noms de fichiers et des identifiants de
 *    fournisseur, jamais un jeton.
 */

type Envelope = { ok: true; data: unknown } | { ok: false; error: string };

const fail = (e: unknown): Envelope => ({
  ok: false,
  error: e instanceof Error ? e.message : String(e),
});

export function registerCloudFsIpc(): void {
  ipcMain.handle("cloudfs:sources", async (): Promise<Envelope> => {
    try {
      return { ok: true, data: { sources: cloudSources() } };
    } catch (e) {
      return fail(e);
    }
  });

  ipcMain.handle("cloudfs:list", async (_e, arg: unknown): Promise<Envelope> => {
    try {
      const { sourceId, folderId } = (arg ?? {}) as { sourceId?: unknown; folderId?: unknown };
      if (typeof sourceId !== "string") throw new Error("Source manquante.");
      // `null` = la racine du compte. Tout le reste doit être une chaîne, validée plus bas
      // avant d'entrer dans une URL de fournisseur ou dans l'argument d'un outil.
      const folder = typeof folderId === "string" ? folderId : null;
      return { ok: true, data: await cloudList(sourceId, folder) };
    } catch (e) {
      return fail(e);
    }
  });
}
