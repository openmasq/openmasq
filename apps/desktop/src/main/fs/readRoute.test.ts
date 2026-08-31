import { describe, it, expect } from "vitest";
import { extractedNote, readRoute } from "./readRoute";

describe("readRoute — qui lit le fichier pour le modèle", () => {
  it("read_document : .docx au worker, tout le reste à l'extraction de main", () => {
    expect(readRoute("read_document", "/r/contrat.docx")).toBe("docx-worker");
    expect(readRoute("read_document", "/r/facture.pdf")).toBe("main-extract");
    expect(readRoute("read_document", "/r/bilan.xlsx")).toBe("main-extract");
  });

  it("read_file sur un DOCUMENT part à l'extraction au lieu d'être refusé (boucle 15/08)", () => {
    // The measured case: three identical `read_file` calls on the same PDF invoice, up to the cap.
    expect(readRoute("read_file", "/r/factures/ovh/Facture_FR40182376.pdf")).toBe("main-extract");
    expect(readRoute("read_file", "/r/Bilan.XLSX")).toBe("main-extract");
    expect(readRoute("read_file", "/r/avenant.docx")).toBe("docx-worker");
  });

  it("le repli ne déborde JAMAIS sur du texte : .txt/.csv/inconnu restent au worker", () => {
    for (const p of ["/r/notes.txt", "/r/export.csv", "/r/README", "/r/data.json", "/r/i.png"]) {
      expect(readRoute("read_file", p)).toBe("worker");
    }
  });

  it("les autres outils ne sont jamais reroutés, quel que soit le chemin", () => {
    for (const t of ["list_directory", "search_files", "get_file_info", "edit_document"]) {
      expect(readRoute(t, "/r/facture.pdf")).toBe("worker");
    }
  });

  it("un chemin absent ou non-string laisse l'op au worker (qui refusera proprement)", () => {
    expect(readRoute("read_file", undefined)).toBe("worker");
    expect(readRoute("read_document", 42)).toBe("worker");
    expect(readRoute("read_file", "")).toBe("worker");
  });

  it("le résultat rerouté DIT ce qui s'est passé et nomme l'outil direct", () => {
    const note = extractedNote("Facture_FR40182376.pdf");
    expect(note).toContain("Facture_FR40182376.pdf");
    expect(note).toContain("read_document");
    expect(note.endsWith("\n")).toBe(true);
  });
});
