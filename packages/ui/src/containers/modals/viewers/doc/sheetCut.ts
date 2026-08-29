import { annotatedCutRow, delimitedGrid } from "@openmasq/redact/documents.browser";
import { MAX_FILE_CHARS } from "../../../../send/foldPayload";

/**
 * La COUPE d'envoi d'un tableur, mappée sur les LIGNES de sa grille — CSV/TSV
 * seulement : même parseur et même sérialisation que l'extraction
 * (`delimitedGrid`/`annotatedCutRow`, une seule maison — règle 9), donc la ligne
 * rendue grisée est EXACTEMENT celle où l'envoi s'arrête. Un classeur XLSX
 * multi-feuilles n'a pas ce mapping sûr (l'extraction saute les lignes vides) :
 * il reste à `null` et l'appelant montre la note générique — jamais un rang faux.
 * Null aussi quand le texte annoté tient dans la borne (pas de coupe).
 */
export function sheetSendCutRow(
  name: string,
  annotatedLength: number,
  bytes: Uint8Array | null | "error",
  isCsv: boolean,
): number | null {
  if (!isCsv || annotatedLength <= MAX_FILE_CHARS || !(bytes instanceof Uint8Array)) return null;
  const raw = new TextDecoder("utf-8").decode(bytes);
  return annotatedCutRow(delimitedGrid(raw, name.toLowerCase().endsWith(".tsv")), MAX_FILE_CHARS);
}
