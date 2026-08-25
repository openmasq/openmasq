import { extractBytes, extractPaths } from "../files";
import { assertReadAllowed } from "./readGate";
import { handle, arr, obj } from "./handle";
import { progressTo } from "./registerFilesIpc";

/**
 * Les extractions — par chemins (normale, plafond d'OCR à 10 pages, et
 * « Lire tout », plafond levé — le geste du chip « N/M pages lues ») et par OCTETS
 * (le drop et les fichiers d'outils MCP : pas de chemin, exprès). Sorties de
 * `registerFilesIpc.ts` (cap LOC) en bloc thématique : même famille, mêmes gardes,
 * même relais de progression — côte à côte pour que rien ne diverge.
 */
export function registerExtractIpc(): void {
  handle("files:extract", [arr], (e, raw) => {
    const paths = raw as string[];
    paths.forEach(assertReadAllowed); // gate before the (Node-only) extractor reads them
    return extractPaths(paths, progressTo(e.sender));
  });
  // « Lire tout » : même extraction + même garde, plafond d'OCR levé — canal SÉPARÉ
  // (la surface IPC reste une allow-list de gestes nommés, pas de drapeaux).
  handle("files:extract-all", [arr], (e, raw) => {
    const paths = raw as string[];
    paths.forEach(assertReadAllowed);
    return extractPaths(paths, progressTo(e.sender), true);
  });
  // La route OCTETS (base64 — le drop, et un fichier rendu par un outil MCP). Pas de
  // garde de lecture : les octets sont déjà au renderer, rien de nouveau n'est accordé.
  handle("files:extract-bytes", [obj], async (e, raw) => {
    const p = raw as { data: string; name?: string; mime?: string };
    // COPIE Uint8Array, jamais le Buffer (pdf.js le rejette, et Buffer.slice est une vue).
    const bytes = new Uint8Array(Buffer.from(p.data, "base64"));
    const name = p.name ?? "file";
    const out = await extractBytes(bytes, name, p.mime, (d, t) => progressTo(e.sender)(name, d, t));
    // Un échec TOTAL rejette ("" se lirait « aucun texte ») ; un partiel rend son texte.
    if (out.error && !out.text.trim()) throw new Error(out.error);
    // STRUCTURÉ, pas le texte nu : l'aperçu peint l'image redacted depuis `words` — la
    // route du drop jetait tout sauf le texte, une CNI déposée s'ouvrait SANS boîtes.
    const { text, words, ocrText, ocr, ocrPages } = out;
    return {
      text,
      ...(words && { words }),
      ...(ocrText && { ocrText }),
      ...(ocr && { ocr }),
      ...(ocrPages && { ocrPages }),
    };
  });
}
