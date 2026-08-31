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
    // The regression this module exists to prevent: waiting for read + OCR before
    // showing anything at all. The user would click, and the app looked frozen.
    const d = deps();
    let resolve!: (f: ExtractedFile) => void;
    const p = stageDeferredFile(
      { name: "scan.pdf", load: () => new Promise<ExtractedFile>((r) => (resolve = r)) },
      "conv1",
      d,
    );
    expect(d.staged).toHaveLength(1); // already placed, even though `load` hasn't resolved
    expect(d.staged[0][0].extracting).toBe(true);
    expect(d.staged[0][0].name).toBe("scan.pdf");
    expect(d.patches).toHaveLength(0);
    resolve(FILE);
    await p;
    expect(d.patches).toHaveLength(1);
  });

  it("le contenu arrive, et `extracting` tombe en MÊME temps que `redacting` monte", async () => {
    // Two separate patches left the chip with no state for one frame, which reads
    // as a failure — and on a large file that frame is visible.
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
    // Removing it would look cleaner and be dishonest: the file was requested, and a
    // faulty chip can be retried where a disappearance leaves nothing to understand.
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
    // A local patch on a chip parked in the store finds nothing, and would leave it
    // « en cours » forever.
    const d = deps();
    await stageDeferredFile({ name: "a.pdf", load: async () => FILE }, "autre-conv", d);
    expect(d.patches[0][2]).toBe("autre-conv");
  });
});

describe("placeholderFor", () => {
  it("nomme le fichier et n'invente aucun contenu", () => {
    const ph = placeholderFor({ name: "a.pdf", mime: "application/pdf", load: async () => FILE }, "c");
    expect(ph).toMatchObject({ name: "a.pdf", mime: "application/pdf", text: "", chars: 0, extracting: true });
    expect(ph.redactPreview).toBe(0); // a made-up counter would lie about what's protected
  });

  it("sans mime connu, le champ est ABSENT plutôt que vide", () => {
    expect("mime" in placeholderFor({ name: "a", load: async () => FILE }, "c")).toBe(false);
  });
});
