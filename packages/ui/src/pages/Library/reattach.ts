import type { ExtractedFile, Host } from "../../host";
import { bytesToBase64 } from "../../state/files/bytes";

/** A stored file just enough to rebuild an attachment from. */
export interface ReattachSource {
  id: string;
  name: string;
  mime: string;
}

/**
 * Rebuild an {@link ExtractedFile} from a stored library file, ready to drop into a
 * new conversation's composer. REUSES the file's persisted extraction (text + OCR)
 * when one was stored — so re-attaching skips re-running OCR/parsing; only OLD rows
 * (stored before extractions were persisted) fall back to a fresh `extractBytes`.
 * Either way the normal send pipeline re-redacted the text with the NEW conversation's
 * own vault, so a re-attach « change les faux au passage » — we never reuse the old
 * scrubbed copy. The original bytes ride along as `data` (base64) so hidden-mode
 * persistence can re-store the file under the new conversation WITHOUT re-reading the
 * on-disk blob — encrypted at rest AND blocked by the read-gate (it lives under the
 * secret `userData/files` dir). We already hold the decrypted bytes here.
 */
export async function loadReattachFile(
  host: Host,
  src: ReattachSource,
): Promise<ExtractedFile> {
  const loaded = await host.db?.loadFile?.(src.id);
  if (!loaded) throw new Error("Fichier introuvable dans la bibliothèque.");
  const b64 = bytesToBase64(loaded.original);
  // Fast path: the extraction was persisted at first attach → reuse it, no OCR.
  const stored = loaded.extraction;
  if (stored?.text) {
    return {
      name: loaded.name,
      kind: "document",
      text: stored.text,
      chars: stored.text.length,
      ocrText: stored.ocrText,
      words: stored.words as ExtractedFile["words"],
      ocr: stored.ocr as ExtractedFile["ocr"],
      mime: loaded.mime,
      data: b64,
    };
  }
  // Fallback (pre-migration rows / nothing stored): re-extract from the original bytes.
  let text = "";
  try {
    text = (await host.files?.extractBytes?.(b64, loaded.name, loaded.mime))?.text ?? "";
  } catch {
    /* unextractable (image/blocked) → no text, still attachable */
  }
  return {
    name: loaded.name,
    kind: "document",
    text,
    chars: text.length,
    mime: loaded.mime,
    data: b64,
  };
}
