import { ipcRenderer } from "electron";

/**
 * Parcourir un stockage connecté (Drive, OneDrive, Dropbox) — le pendant de `localfs` pour les
 * fichiers qui ne sont pas sur cette machine. Même contrat d'enveloppe : main répond
 * `{ok, data} | {ok, error}` et on relève ici, pour que le panneau montre la vraie raison
 * d'un échec plutôt que « Error invoking remote method … ».
 *
 * Lecture seule, et de la seule forme dont une interface a besoin : lister. Lire le
 * CONTENU d'un fichier reste l'affaire du modèle et de ses outils.
 */
type Envelope<T> = { ok: true; data: T } | { ok: false; error: string };

async function call<T>(channel: string, payload?: unknown): Promise<T> {
  const r = (await ipcRenderer.invoke(channel, payload)) as Envelope<T>;
  if (!r?.ok) throw new Error(r?.error || "opération impossible");
  return r.data;
}

export interface CloudEntry {
  /** L'identifiant du fournisseur (fileId Drive, itemId Graph, chemin Dropbox) — opaque. */
  id: string;
  name: string;
  kind: "dir" | "file";
  mtime: number;
}

export interface CloudSource {
  id: string;
  connectorId: string;
  label?: string;
}

export const cloudFs = {
  /** Les stockages connectés que l'app sait parcourir (vide = aucun). */
  sources: (): Promise<{ sources: CloudSource[] }> => call("cloudfs:sources"),
  /** Le contenu d'un dossier ; `folderId` absent = la racine du compte. */
  list: (sourceId: string, folderId: string | null): Promise<{ entries: CloudEntry[] }> =>
    call("cloudfs:list", { sourceId, folderId }),
};
