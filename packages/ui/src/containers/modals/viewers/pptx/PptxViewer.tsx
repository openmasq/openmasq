import { useEffect, useState } from "react";
import { FileSkeleton } from "../FileSkeleton";
import { parsePptx } from "./parsePptx";
import { PptxRender } from "./PptxRender";
import type { PptxDeck } from "./pptxModel";

import { useT } from "../../../../i18n";
// Faithful .pptx preview: each slide rendered at its true geometry (see
// `pptxLayout.ts` for the scaling), from the deck's own shape positions.
//
// The caller passes the CURRENTLY SELECTED version's bytes (original ⇄ redacted), so
// the redaction toggle stays a re-parse of the other byte set. VIEWER-ONLY: bytes are
// read, rendered and forgotten.

export function PptxViewer({ bytes }: { bytes: Uint8Array }) {
  const t = useT();
  const [deck, setDeck] = useState<PptxDeck | null | "error">(null);

  useEffect(() => {
    let alive = true;
    setDeck(null);
    parsePptx(bytes)
      .then((d) => alive && setDeck(d))
      // A parse failure shows an error, never an empty deck: a blank render would read
      // as "this presentation has no slides" — a claim about the user's file we have
      // not earned. `parsePptx` throws rather than returning an empty deck.
      .catch(() => alive && setDeck("error"));
    return () => {
      alive = false;
    };
  }, [bytes]);

  if (deck === null) return <FileSkeleton variant="doc" />;
  if (deck === "error") return <div className="fv-status">{t.viewers.unreadablePresentation}</div>;
  return <PptxRender deck={deck} />;
}
