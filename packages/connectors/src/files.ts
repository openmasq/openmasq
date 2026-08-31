/**
 * What "listing a folder" means, once and for all.
 *
 * Two paths need it and they must NOT diverge: the `list_folder` tool the
 * model calls, and the app's « Dossiers » panel, which lists the same account for
 * the user. One single URL construction, one single response parsing — otherwise
 * the screen and the model end up no longer seeing the same Drive.
 */

/** A remote folder entry, reduced to what a listing shows. */
export interface RemoteEntry {
  /** The provider's identifier (Drive fileId, Graph itemId) — never a path. */
  id: string;
  name: string;
  kind: "dir" | "file";
  /** Epoch ms; 0 when the provider didn't give one. */
  mtime: number;
}

/**
 * A folder identifier arrives either from the MODEL (a tool call) or from the RENDERER
 * (the panel) — never from us. It ends up in the provider's URL: in Drive's `q='<id>' in
 * parents`, in a Graph path segment. It is therefore validated against a character
 * allow-list before any request.
 *
 * Drive uses `[A-Za-z0-9_-]`, Graph adds `!` and `.` to it. Neither uses a
 * quote, a space, or a forward slash — exactly what would be needed to break out of
 * the query or the path. A rejected id THROWS: that's a malformed call, not an empty folder.
 */
const ID_RE = /^[A-Za-z0-9_!.-]{1,200}$/;
export function assertFileId(id: string): string {
  if (!ID_RE.test(id)) throw new Error("Identifiant de fichier invalide.");
  return id;
}

/** Folders first, then A→Z (accent- and case-insensitive). */
export function sortRemote(entries: RemoteEntry[]): RemoteEntry[] {
  return entries.sort(
    (a, b) =>
      (a.kind === "dir" ? 0 : 1) - (b.kind === "dir" ? 0 : 1) ||
      a.name.localeCompare(b.name, "fr", { sensitivity: "base" }),
  );
}

/** Epoch ms from an ISO string, 0 if absent or unreadable. */
export const remoteTime = (iso?: string): number => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : 0;
};

/** The rendering of a listing FOR THE MODEL — the same across both connectors, so a
 *  shape change doesn't apply to only half of them. */
export function renderRemoteList(entries: RemoteEntry[]): string {
  if (entries.length === 0) return "Dossier vide.";
  return entries
    .map((e) => `${e.kind === "dir" ? "[dossier] " : ""}${e.name} · id:${e.id}`)
    .join("\n");
}

/** A file to attach/drop — resolved by the DESKTOP (never the model) from the
 *  conversation's local store and injected into the call as `__attachmentData`.
 *  `contentBase64` carries the ORIGINAL bytes (standard base64); the model only
 *  NAMES the files, it never sees the bytes. One single home: Gmail, Outlook
 *  and Drive share it — the third copy is the one we don't write (rule 9). */
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
