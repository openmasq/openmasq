import { describe, it, expect } from "vitest";
import { makeStaging } from "./attachmentStaging";
import type { Attachment } from "./Composer";

const chip = (cid: string, over: Partial<Attachment> = {}): Attachment => ({
  name: `${cid}.pdf`,
  kind: "pdf",
  text: "",
  chars: 0,
  cid,
  redactPreview: 0,
  extracting: true,
  ...over,
});

function harness(current: string | undefined) {
  let local: Attachment[] = [];
  const store = new Map<string, Attachment[]>();
  const s = makeStaging({
    currentConvId: () => current,
    setLocal: (u) => (local = u(local)),
    getParked: (id) => store.get(id),
    setParked: (id, files) => void store.set(id, files),
  });
  return { s, local: () => local, parked: (id: string) => store.get(id) ?? [] };
}

describe("makeStaging — la correction suit la pose, jamais l'inverse", () => {
  it("pose LOCALEMENT quand c'est la conversation à l'écran", () => {
    const h = harness("conv1");
    h.s.stage([chip("a")], "conv1");
    expect(h.local()).toHaveLength(1);
    expect(h.parked("conv1")).toHaveLength(0);
  });

  it("PARQUE quand la conversation n'est pas encore à l'écran", () => {
    // « Demander » creates the conversation and stages the file in the same breath:
    // it only reaches the screen a commit later. Placing it locally would show it on
    // the conversation being left.
    const h = harness("conv1");
    h.s.stage([chip("a")], "conv2");
    expect(h.local()).toHaveLength(0);
    expect(h.parked("conv2")).toHaveLength(1);
  });

  it("corrige un chip PARQUÉ là où il est — sinon il reste « en cours » pour toujours", () => {
    // THE regression this module exists to prevent.
    const h = harness("conv1");
    h.s.stage([chip("a")], "conv2");
    h.s.patch("a", { extracting: false, text: "bonjour" }, "conv2");
    expect(h.parked("conv2")[0]).toMatchObject({ extracting: false, text: "bonjour" });
    expect(h.local()).toHaveLength(0);
  });

  it("corrige un chip LOCAL sans toucher au magasin", () => {
    const h = harness("conv1");
    h.s.stage([chip("a")], "conv1");
    h.s.patch("a", { extracting: false }, "conv1");
    expect(h.local()[0].extracting).toBe(false);
    expect(h.parked("conv1")).toHaveLength(0);
  });

  it("ne touche QUE le chip visé", () => {
    const h = harness("conv1");
    h.s.stage([chip("a"), chip("b")], "conv1");
    h.s.patch("b", { error: "raté" }, "conv1");
    expect(h.local()[0].error).toBeUndefined();
    expect(h.local()[1].error).toBe("raté");
  });

  it("AJOUTE aux chips déjà parqués au lieu de les remplacer", () => {
    const h = harness("conv1");
    h.s.stage([chip("a")], "conv2");
    h.s.stage([chip("b")], "conv2");
    expect(h.parked("conv2").map((c) => c.cid)).toEqual(["a", "b"]);
  });

  it("sans id de conversation, tout reste local", () => {
    const h = harness("conv1");
    h.s.stage([chip("a")]);
    h.s.patch("a", { extracting: false });
    expect(h.local()[0].extracting).toBe(false);
  });
});

describe("un même fichier ne se joint pas deux fois (15/08/2026)", () => {
  it("« Demander » répété sur le MÊME document n'ajoute rien", () => {
    const h = harness("conv1");
    h.s.stage([chip("a", { path: "/r/Kbis.pdf" })]);
    h.s.stage([chip("b", { path: "/r/Kbis.pdf" })]); // same path, different cid
    expect(h.local()).toHaveLength(1);
    expect(h.local()[0]?.cid).toBe("a"); // the first chip stays, with its redaction
  });

  it("un autre document s'ajoute normalement", () => {
    const h = harness("conv1");
    h.s.stage([chip("a", { path: "/r/Kbis.pdf" })]);
    h.s.stage([chip("b", { path: "/r/Bilan.xlsx" })]);
    expect(h.local().map((a) => a.cid)).toEqual(["a", "b"]);
  });

  it("⚠️ le chip VIDE déjà posé est reconnu quand le second clic arrive (cas réel)", () => {
    // « Demander » places a chip with no text, which the extraction then fills in. A key
    // frozen on the size no longer recognized the first one — the duplicate went through
    // again, verified live in the app before this fix.
    const h = harness("conv1");
    h.s.stage([chip("a", { path: "/r/Kbis.pdf", text: "" })]);
    h.s.patch("a", { text: "contenu extrait, long" });
    h.s.stage([chip("b", { path: "/r/Kbis.pdf", text: "" })]);
    expect(h.local()).toHaveLength(1);
  });

  it("sans chemin : un chip vide et le même fichier rempli restent UNE pièce", () => {
    const h = harness("conv1");
    h.s.stage([chip("a", { name: "note.txt", text: "" })]);
    h.s.patch("a", { text: "bonjour" });
    h.s.stage([chip("b", { name: "note.txt", text: "" })]);
    expect(h.local()).toHaveLength(1);
  });

  it("sans chemin (ré-attachement), l'identité est le NOM + la taille du texte", () => {
    const h = harness("conv1");
    h.s.stage([chip("a", { name: "note.txt", text: "bonjour" })]);
    h.s.stage([chip("b", { name: "note.txt", text: "bonjour" })]);
    expect(h.local()).toHaveLength(1);
    // …but a namesake with different content really is a different file.
    h.s.stage([chip("c", { name: "note.txt", text: "autre chose" })]);
    expect(h.local()).toHaveLength(2);
  });

  it("le lot lui-même est dédoublonné, et la règle vaut aussi pour un chip PARQUÉ", () => {
    const h = harness("conv1");
    h.s.stage([chip("a", { path: "/r/x.pdf" }), chip("b", { path: "/r/x.pdf" })], "conv2");
    expect(h.parked("conv2")).toHaveLength(1);
    h.s.stage([chip("c", { path: "/r/x.pdf" })], "conv2");
    expect(h.parked("conv2")).toHaveLength(1);
  });
});
