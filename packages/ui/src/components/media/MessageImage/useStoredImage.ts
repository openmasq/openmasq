import { useEffect, useState } from "react";
import { useHost } from "../../../host";
import { bytesToDataUrl, downscaleDataUrl } from "../../../hooks/imageThumb";

// Re-exported for the few callers that build a data URL directly.
export { bytesToDataUrl };

/** Max edge (px) + JPEG quality for an INLINE chat image preview — downscaled so a
 *  multi-MB plot/export isn't decoded + held at full resolution in every mounted bubble.
 *  Larger/crisper than the library card (images are more prominent inline); the modal
 *  viewer still loads the full original. */
const INLINE_MAX_EDGE = 768;
const INLINE_QUALITY = 0.8;

/** Resolve a stored image by NAME to a FULL-RESOLUTION `data:` URL — the same lookup as
 *  {@link useStoredImage} without the downscale, for PRINT: a chart shown at 768 px on
 *  screen lands around 115 dpi on an A4 page, visibly soft, while matplotlib exported it
 *  at dpi=200. Used by the document export (`export/documentBlocks.ts`
 *  `resolveImageBlocks`). `null` when the file can't be resolved — the caller keeps the
 *  on-screen version rather than losing the image. */
export async function loadStoredImageFull(
  name: string,
  conversationIds: string[],
  db: { listFiles?: DbList; loadFile?: DbLoad } | undefined,
): Promise<string | null> {
  const list = db?.listFiles;
  const load = db?.loadFile;
  if (!list || !load) return null;
  for (const cid of conversationIds.filter(Boolean)) {
    const metas = await list(cid).catch(() => []);
    const meta = [...metas].reverse().find((m) => m.name === name);
    if (!meta) continue;
    const file = await load(meta.id).catch(() => null);
    if (file?.original?.length) return bytesToDataUrl(file.original, file.mime || meta.mime || "");
  }
  return null;
}

type DbList = (conversationId: string) => Promise<{ id: string; name: string; mime?: string }[]>;
type DbLoad = (id: string) => Promise<{ original: Uint8Array; mime?: string } | null>;

export type StoredImageState =
  | { status: "loading" }
  | { status: "ready"; src: string }
  | { status: "error" };

/**
 * Resolve a stored file by NAME (attachments carry the name, not the id) across the
 * conversation's storage ids, load its ORIGINAL bytes, DOWNSCALE them to a light preview,
 * and expose that as a `data:` URL for inline `<img>` display. The user always sees the
 * REAL preview (the model only ever received a placeholder). Best-effort: a missing
 * DB / file yields `error`, so the caller falls back to a chip.
 *
 * `enabled` gates the DB read + decode on VISIBILITY (the caller passes an in-view flag),
 * so an off-screen image never loads its bytes — the inline analogue of the library's
 * lazy thumbnails. `false` ⇒ stays `loading` (a skeleton) without touching the DB.
 */
export function useStoredImage(
  name: string,
  conversationIds: string[],
  enabled = true,
): StoredImageState {
  const host = useHost();
  const [state, setState] = useState<StoredImageState>({ status: "loading" });
  // Stable dep: the ids joined, so an unchanged array doesn't re-run the effect.
  const key = conversationIds.filter(Boolean).join("|");

  useEffect(() => {
    if (!enabled) return; // not in view yet → keep the skeleton, load nothing
    let alive = true;
    const list = host.db?.listFiles;
    const load = host.db?.loadFile;
    if (!list || !load) {
      setState({ status: "error" });
      return;
    }
    setState({ status: "loading" });
    (async () => {
      for (const cid of key.split("|").filter(Boolean)) {
        const metas = await list(cid).catch(() => []);
        const meta = [...metas].reverse().find((m) => m.name === name);
        if (!meta) continue;
        const file = await load(meta.id).catch(() => null);
        if (!file?.original?.length) continue;
        if (!alive) return;
        const small = await downscaleDataUrl(
          bytesToDataUrl(file.original, file.mime || meta.mime),
          INLINE_MAX_EDGE,
          INLINE_QUALITY,
        );
        if (!alive) return;
        setState({ status: "ready", src: small });
        return;
      }
      if (alive) setState({ status: "error" });
    })();
    return () => {
      alive = false;
    };
  }, [host, name, key, enabled]);

  return state;
}
