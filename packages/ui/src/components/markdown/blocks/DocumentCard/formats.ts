import type { Messages } from "@openmasq/i18n";

/**
 * The document card's download formats — the vocabulary of the « Télécharger » menu, kept
 * out of the component so the list is data (one place to add a format) and the menu stays
 * presentational. The COPY comes from the catalogue; this file keeps the ORDER and the shape.
 *
 * Order is deliberate: the two RICH formats first (they carry the layout the user just read),
 * then the two plain ones. `mono` marks a format whose label IS a file extension, worn in the
 * mono face like the rest of the app's file affordances.
 */

export type DownloadFormat = "pdf" | "docx" | "md" | "txt";

/** The two formats built from the rendered DOM — slower, and they own the busy state. */
export type RichFormat = "pdf" | "docx";

export interface FormatOption {
  id: DownloadFormat;
  label: string;
  /** One line under the label: what the user gets, not how it is made. */
  hint: string;
  mono?: boolean;
}

export function downloadFormats(t: Messages): FormatOption[] {
  return [
    { id: "pdf", ...t.downloads.pdf },
    { id: "docx", ...t.downloads.docx },
    { id: "md", ...t.downloads.md, mono: true },
    { id: "txt", ...t.downloads.txt, mono: true },
  ];
}

export const isRichFormat = (f: DownloadFormat): f is RichFormat => f === "pdf" || f === "docx";
