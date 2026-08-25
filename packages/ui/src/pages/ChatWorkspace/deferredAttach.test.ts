import { describe, it, expect, vi } from "vitest";
import { stageDeferredFile, placeholderFor, type DeferredAttachDeps } from "./deferredAttach";
import type { Attachment } from "./Composer";
import type { ExtractedFile } from "../../host";

const FILE: ExtractedFile = { name: "scan.pdf", kind: "pdf", text: "Paul Morvanz", chars: 12 };

function deps(over: Partial<DeferredAttachDeps> = {}): DeferredAttachDeps & {
  staged: Attachment[][];
  patches: [string, Partial<Attachment>, string | undefined][];
} {
  const staged: Attachment[][] = [];
  const patches: [string, Partial<Attachment>, string | undefined][] = [];
  return {
    staged,
    patches,
    stage: (f) => staged.push(f),
    patch: (cid, p, conv) => patches.push([cid, p, conv]),
    countMatches: () => 3,
    onExtracted: vi.fn(),
    newCid: () => "cid1",
    ...over,
  };
}

describe("stageDeferredFile — le chip paraît AVANT le contenu", () => {
  it("pose le chip avant le premier await, pas après", async () => {
    // La régression que ce module existe pour empêcher : attendre lecture + OCR avant de
    // montrer quoi que ce soit. L'utilisateur cliquait, et l'app avait l'air figée.
    const d = deps();
    let resolve!: (f: ExtractedFile) => void;
    const p = stageDeferredFile(
      { name: "scan.pdf", load: () => new Promise<ExtractedFile>((r) => (resolve = r)) },
      "conv1",
      d,
    );
    expect(d.staged).toHaveLength(1); // déjà posé, alors que `load` n'a pas rendu
    expect(d.staged[0][0].extracting).toBe(true);
    expect(d.staged[0][0].name).toBe("scan.pdf");
    expect(d.patches).toHaveLength(0);
    resolve(FILE);
    await p;
    expect(d.patches).toHaveLength(1);
  });

  it("le contenu arrive, et `extracting` tombe en MÊME temps que `redacting` monte", async () => {
    // Deux correctifs séparés laissaient le chip une frame sans aucun état, ce qui se lit
    // comme un échec — et sur un fichier volumineux la frame se voit.
    const d = deps();
    await stageDeferredFile({ name: "scan.pdf", load: async () => FILE }, "conv1", d);
    const [cid, patch, conv] = d.patches[0];
    expect(cid).toBe("cid1");
    expect(conv).toBe("conv1");
    expect(patch.extracting).toBe(false);
    expect(patch.redacting).toBe(true);
    expect(patch.text).toBe("Paul Morvanz");
    expect(patch.redactPreview).toBe(3);
  });

  it("un texte VIDE ne lance pas de redaction — mais le chip existe quand même", async () => {
    const d = deps();
    await stageDeferredFile(
      { name: "photo.png", load: async () => ({ ...FILE, name: "photo.png", text: "", chars: 0 }) },
      undefined,
      d,
    );
    expect(d.patches[0][1].redacting).toBe(false);
    expect(d.patches[0][1].extracting).toBe(false);
  });

  it("un ÉCHEC laisse le chip, marqué — il ne le fait pas disparaître", async () => {
    // Le retirer serait plus propre à l'œil et malhonnête : le fichier a été demandé, et un
    // chip fautif se réessaie là où une disparition ne laisse rien à comprendre.
    const d = deps();
    await stageDeferredFile(
      { name: "cassé.pdf", load: () => Promise.reject(new Error("illisible")) },
      "conv1",
      d,
    );
    expect(d.staged).toHaveLength(1);
    expect(d.patches).toHaveLength(1);
    expect(d.patches[0][1]).toMatchObject({ extracting: false, error: "extraction échouée" });
    expect(d.onExtracted).not.toHaveBeenCalled();
  });

  it("corrige DU MÊME CÔTÉ que la pose — l'id de conversation est rendu tel quel", async () => {
    // Un correctif local sur un chip parqué dans le magasin ne trouve rien, et le laisserait
    // « en cours » pour toujours.
    const d = deps();
    await stageDeferredFile({ name: "a.pdf", load: async () => FILE }, "autre-conv", d);
    expect(d.patches[0][2]).toBe("autre-conv");
  });
});

describe("placeholderFor", () => {
  it("nomme le fichier et n'invente aucun contenu", () => {
    const ph = placeholderFor({ name: "a.pdf", mime: "application/pdf", load: async () => FILE }, "c");
    expect(ph).toMatchObject({ name: "a.pdf", mime: "application/pdf", text: "", chars: 0, extracting: true });
    expect(ph.redactPreview).toBe(0); // un compteur inventé mentirait sur ce qui est protégé
  });

  it("sans mime connu, le champ est ABSENT plutôt que vide", () => {
    expect("mime" in placeholderFor({ name: "a", load: async () => FILE }, "c")).toBe(false);
  });
});
