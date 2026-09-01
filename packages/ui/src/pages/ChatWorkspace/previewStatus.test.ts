import { getMessages } from "@openmasq/i18n";
import { describe, it, expect } from "vitest";
import { previewStatus } from "./composerDetection";

/* The composer's preview has two layers: the deterministic, synchronous rules, then the
   NER ~1s later.

   A manual bench of 100 prompts was run exactly in this window: nine entities that were
   in fact protected at send time (Acme, Kelm, Rebour & Associés, TechnipFMC…) were
   logged there as leaks, and the tester concluded that redaction didn't
   work. No data was at risk; it was TRUST that was.

   What this imposes here: during the analysis, this pill says NOTHING — neither a
   partial count that would read as a total, nor a zero. The "it's working" state is carried by
   the send button, over exactly the same window (`busy = redacting || detecting`). */

const fr = getMessages("fr");

describe("previewStatus — l'aperçu ne promet que ce qu'il a calculé", () => {
  it("se tait tant qu'une couche travaille, même avec des valeurs déjà repérées", () => {
    // A partial count shown here would read as the final result.
    expect(previewStatus(true, 2, true, fr)).toEqual({ kind: "none" });
    expect(previewStatus(true, 0, true, fr)).toEqual({ kind: "none" });
  });

  it("n'affiche le total qu'une fois les deux couches revenues", () => {
    expect(previewStatus(false, 3, true, fr)).toEqual({ kind: "count", label: "3 à masquer" });
  });

  it("le zéro acquis est muet", () => {
    expect(previewStatus(false, 0, true, fr)).toEqual({ kind: "none" });
  });

  it("ne dit rien sur un composeur vide", () => {
    expect(previewStatus(true, 0, false, fr)).toEqual({ kind: "none" });
    expect(previewStatus(false, 5, false, fr)).toEqual({ kind: "none" });
  });
});
