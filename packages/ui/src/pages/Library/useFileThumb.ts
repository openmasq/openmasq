import { useEffect, useState } from "react";
import { useHost } from "../../host";
import { bytesToDataUrl, downscaleDataUrl } from "../../hooks/imageThumb";

/** Max edge (px) + JPEG quality for a LIBRARY card preview — a downscaled, lighter copy
 *  so a 4000px photo isn't decoded + held at full resolution behind a ~180px card. The
 *  full-quality original is only ever loaded by the modal viewer (a separate path). */
const THUMB_MAX_EDGE = 360;
const THUMB_QUALITY = 0.6;

/**
 * Load a stored file's ORIGINAL bytes by id and expose them as a `data:` URL for an
 * image card thumbnail — the user always sees the REAL preview (the model only ever
 * got a placeholder). Only runs when `enabled` (image files); non-images skip the DB
 * read. Returns null while loading / on error, so the card falls back to an icon.
 */
export function useFileThumb(id: string, mime: string, enabled: boolean): string | null {
  const host = useHost();
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setSrc(null);
      return;
    }
    const load = host.db?.loadFile;
    if (!load) return;
    let alive = true;
    load(id)
      .then(async (f) => {
        if (!alive || !f?.original?.length) return;
        // Downscale to a light preview (card display only) — the modal viewer loads the
        // full original separately. A slow decode/downscale can't block: it's off-thread
        // via the Image/canvas onload and guarded by `alive`.
        const small = await downscaleDataUrl(
          bytesToDataUrl(f.original, f.mime || mime),
          THUMB_MAX_EDGE,
          THUMB_QUALITY,
        );
        if (alive) setSrc(small);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [host, id, mime, enabled]);

  return src;
}
