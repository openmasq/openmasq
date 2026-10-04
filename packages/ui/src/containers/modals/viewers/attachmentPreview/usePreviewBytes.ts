import { useEffect, useState } from "react";
import { useHost } from "../../../../host";
import { base64ToBytes } from "../../../../state/files/bytes";

/**
 * The file's own bytes for the rich renderers (PDF, sheet, docx, pptx, image): from the bytes
 * the renderer already holds (a drop, a re-attach — `data`, no path by design) or through the
 * read gate for a NATIVELY picked `path`. `null` while loading, `"error"` when unreadable.
 */
export function usePreviewBytes(
  file: { path?: string; data?: string },
  wanted: boolean,
): Uint8Array | null | "error" {
  // Only the read gate depends on the host: held bytes never re-decode on a host change.
  const read = useHost().files?.read;
  const [bytes, setBytes] = useState<Uint8Array | null | "error">(null);
  useEffect(() => {
    if (!wanted) return;
    let alive = true;
    // No path ⇒ the bytes we already hold (a drop / re-attach never has one).
    if (!file.path) {
      try {
        setBytes(base64ToBytes(file.data!));
      } catch {
        setBytes("error");
      }
      return;
    }
    if (!read) {
      setBytes("error");
      return;
    }
    read(file.path)
      .then((b) => alive && setBytes(b as Uint8Array))
      .catch(() => alive && setBytes("error"));
    return () => {
      alive = false;
    };
  }, [wanted, file.path, file.data, read]);
  return bytes;
}
