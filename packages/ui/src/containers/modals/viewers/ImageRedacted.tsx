import { useEffect, useRef, useState } from "react";
import { bytesToDataUrl } from "../../../components/media/MessageImage";
import type { ExtractedFile } from "../../../host";
import type { PdfReplacement } from "@openmasq/redact/pdf-redact";

/**
 * L'image STOCKÉE, peinte redacted — le pendant Bibliothèque de ce que la modale
 * post-dépôt fait pour un scan (mêmes boîtes, même `renderRedactedImage`). Lecture
 * seule : ni pick de mots, ni révélation — ces gestes appartiennent à la modale
 * d'AVANT-envoi, la seule qui affecte le fil (containers/CLAUDE.md).
 *
 * Repli FIDÈLE : si la peinture échoue (police, format, OOM canvas), on montre
 * l'ORIGINAL — jamais un écran vide — et c'est acceptable ici uniquement parce que
 * l'onglet s'appelle « Redacted » côté modale, pas parce que l'échec serait rare.
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
