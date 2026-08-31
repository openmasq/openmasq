import { useEffect, useState } from "react";
import { FileSkeleton } from "../FileSkeleton";
import { parseDocx } from "./parseDocx";
import { DocxRender } from "./DocxRender";
import type { DocxDoc } from "./docxModel";

import { useT } from "../../../../i18n";
// Faithful .docx preview. Parses the OOXML ourselves (`parseDocx`) into a typed model
// and renders it with React (`DocxRender`) — see `docxModel.ts` for why a closed model
// rather than a sanitised HTML string.
//
// The caller passes the CURRENTLY SELECTED version's bytes (original ⇄ redacted), so
// the redaction toggle stays a re-parse of the other byte set. VIEWER-ONLY: bytes are
// read, rendered and forgotten — nothing here writes to disk or the DB.

export function DocxViewer({ bytes }: { bytes: Uint8Array }) {
  const t = useT();
  const [doc, setDoc] = useState<DocxDoc | null | "error">(null);

  useEffect(() => {
    let alive = true;
    setDoc(null);
    parseDocx(bytes)
      .then((d) => alive && setDoc(d))
      // A parse failure shows an error, never an empty page: a blank render would
      // read as "this document is empty" — a claim about the user's file we have not
      // earned. `parseDocx` throws rather than returning an empty model for the same
      // reason (`parseDocx.test.ts` pins it).
      .catch(() => alive && setDoc("error"));
    return () => {
      alive = false;
    };
  }, [bytes]);

  if (doc === null) return <FileSkeleton variant="doc" />;
  if (doc === "error") return <div className="fv-status">{t.viewers.unreadableDocument}</div>;
  return <DocxRender doc={doc} />;
}
