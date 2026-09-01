import { useEffect, useRef, useState } from "react";
import { bytesToDataUrl } from "../../../components/media/MessageImage";
import type { ExtractedFile } from "../../../host";
import type { PdfReplacement } from "@openmasq/redact/pdf-redact";

/**
 * The STORED image, painted redacted — the Bibliothèque counterpart of what the modal
 * does post-upload for a scan (same boxes, same `renderRedactedImage`). Read
 * only: no word picking, no reveal — those gestures belong to the
 * BEFORE-send modal, the only one that affects the thread (containers/CLAUDE.md).
 *
 * FAITHFUL fallback: if the painting fails (font, format, canvas OOM), we show
 * the ORIGINAL — never a blank screen — and that's acceptable here only because
 * the tab is called « Masqué » on the modal side, not because the failure would be rare.
 */
export function ImageRedacted({
  bytes,
  mime,
  words,
  replacements,
}: {
  bytes: Uint8Array;
  mime: string;
  words: NonNullable<ExtractedFile["words"]>;
  replacements: PdfReplacement[];
}) {
  const [src, setSrc] = useState<string | null>(null);
  const fallback = useRef(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { renderRedactedImage } = await import("@openmasq/redact/image-redact");
        const { canvas } = await renderRedactedImage({ bytes, words, replacements, reveal: new Set<string>() });
        if (alive) setSrc(canvas.toDataURL("image/png"));
      } catch {
        fallback.current = true;
        if (alive) setSrc(bytesToDataUrl(bytes, mime));
      }
    })();
    return () => {
      alive = false;
    };
  }, [bytes, mime, words, replacements]);
  return <div className="fv-image">{src && <img src={src} alt="" />}</div>;
}
