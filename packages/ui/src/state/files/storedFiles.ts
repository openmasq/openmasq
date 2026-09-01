/**
 * ONE lookup for « the stored file this attachment NAMES ».
 *
 * A message attachment carries a name; the files table is keyed by id — and a
 * conversation can own TWO storage ids (its own, plus a keyless `sessionConversationId`),
 * so resolving one means walking both. Written once here because three callers need the
 * exact same walk and a second copy is where the two would drift (root rule 9).
 *
 * ⚠️ The IMAGE loaders (`components/media/MessageImage/useStoredImage.ts`) deliberately do
 * NOT use this: they must fall THROUGH to the next storage id when the matching row holds
 * no bytes, which needs the byte load inside the loop. Different contract, not an oversight.
 */

/** The only fields the walk reads — `host.db.listFiles`'s `FileMeta` satisfies it. */
export type StoredFileRef = { id: string; name: string; mime?: string };

/**
 * Newest match wins: a turn may re-save the SAME filename (an enriched second pass), and
 * the deliverable is the latest bytes. Returns the storage id it was found under, because
 * that — not the conversation id — is what the viewer needs to resolve the file's vault.
 * A missing `list` (no DB: browser preview) or a name that matches nothing yields `null`;
 * a listing that throws is treated as "not here" and the walk continues.
 */
export async function findStoredFile<T extends StoredFileRef>(
  name: string,
  storageIds: readonly (string | null | undefined)[],
  list: ((conversationId: string) => Promise<T[]>) | undefined,
): Promise<{ meta: T; convId: string } | null> {
  if (!list) return null;
  for (const cid of storageIds) {
    if (!cid) continue;
    const metas = await list(cid).catch(() => [] as T[]);
    const meta = [...metas].reverse().find((m) => m.name === name);
    if (meta) return { meta, convId: cid };
  }
  return null;
}
