/**
 * Ce que « lister un dossier » veut dire, une fois pour toutes.
 *
 * Deux chemins en ont besoin et ils ne doivent PAS diverger : l'outil `list_folder` que le
 * modèle appelle, et le panneau « Dossiers » de l'app, qui liste le même compte pour
 * l'utilisateur. Une seule construction d'URL, une seule relecture de réponse — sinon
 * l'écran et le modèle finissent par ne plus voir le même Drive.
 */

/** Une entrée de dossier distant, réduite à ce qu'une liste montre. */
export interface RemoteEntry {
  /** L'identifiant du fournisseur (Drive fileId, Graph itemId) — jamais un chemin. */
  id: string;
  name: string;
  kind: "dir" | "file";
  /** Epoch ms ; 0 quand le fournisseur ne l'a pas donné. */
  mtime: number;
}

/**
 * Un identifiant de dossier arrive soit du MODÈLE (appel d'outil), soit du RENDERER
 * (panneau) — jamais de nous. Il finit dans l'URL du fournisseur : dans le `q='<id>' in
 * parents` de Drive, dans un segment de chemin de Graph. Il est donc validé en liste
 * blanche de caractères avant toute requête.
 *
 * Drive emploie `[A-Za-z0-9_-]`, Graph y ajoute `!` et `.`. Aucun des deux n'utilise de
 * guillemet, d'espace ni de barre oblique — précisément ce qu'il faudrait pour sortir de
 * la requête ou du chemin. Un id refusé LÈVE : c'est un appel malformé, pas un dossier vide.
 */
const ID_RE = /^[A-Za-z0-9_!.-]{1,200}$/;
export function assertFileId(id: string): string {
  if (!ID_RE.test(id)) throw new Error("Identifiant de fichier invalide.");
  return id;
}

/** Dossiers d'abord, puis A→Z (insensible aux accents et à la casse). */
export function sortRemote(entries: RemoteEntry[]): RemoteEntry[] {
  return entries.sort(
    (a, b) =>
      (a.kind === "dir" ? 0 : 1) - (b.kind === "dir" ? 0 : 1) ||
      a.name.localeCompare(b.name, "fr", { sensitivity: "base" }),
  );
}

/** Epoch ms depuis un ISO, 0 si absent ou illisible. */
export const remoteTime = (iso?: string): number => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : 0;
};

/** Le rendu d'une liste POUR LE MODÈLE — la même dans les deux connecteurs, pour qu'un
 *  changement de forme ne s'applique pas qu'à la moitié. */
export function renderRemoteList(entries: RemoteEntry[]): string {
  if (entries.length === 0) return "Dossier vide.";
  return entries
    .map((e) => `${e.kind === "dir" ? "[dossier] " : ""}${e.name} · id:${e.id}`)
    .join("\n");
}

/** Un fichier à joindre/déposer — résolu par le DESKTOP (jamais le modèle) depuis le
 *  magasin local de la conversation et injecté dans l'appel en `__attachmentData`.
 *  `contentBase64` porte les octets ORIGINAUX (base64 standard) ; le modèle ne fait que
 *  NOMMER les fichiers, il ne voit jamais les octets. Une seule maison : Gmail, Outlook
 *  et Drive la partagent — la troisième copie est celle qu'on n'écrit pas (règle 9). */
export interface AttachmentData {
  filename: string;
  mimeType: string;
  contentBase64: string;
}

export function readAttachments(v: unknown): AttachmentData[] {
  if (!Array.isArray(v)) return [];
  return v.filter(
    (a): a is AttachmentData =>
      !!a && typeof a === "object" && typeof (a as AttachmentData).contentBase64 === "string" && !!(a as AttachmentData).contentBase64,
  );
}
