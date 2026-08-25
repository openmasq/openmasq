import { describe, it, expect, vi } from "vitest";
import {
  FOLDER_OFFER_NOTE,
  dragCarriesFiles,
  folderOfferText,
  readDrop,
  type DroppedFolder,
} from "./dropIntake";

/** A `DataTransferItem` is not constructible; these are the two shapes the code reads. */
const fileItem = (): DataTransferItem =>
  ({ kind: "file", webkitGetAsEntry: () => ({ isDirectory: false, name: "" }) }) as unknown as DataTransferItem;
const dirItem = (name: string): DataTransferItem =>
  ({ kind: "file", webkitGetAsEntry: () => ({ isDirectory: true, name }) }) as unknown as DataTransferItem;
const stringItem = (): DataTransferItem =>
  ({ kind: "string", webkitGetAsEntry: () => null }) as unknown as DataTransferItem;

const f = (name: string) => new File(["x"], name);

describe("readDrop — files and folders take different routes on purpose", () => {
  it("routes a dropped FILE to the attach list, as a File (never a path)", () => {
    // The whole point: the bytes are a capability the renderer already holds, so nothing
    // new is granted. A path would need `grantRead`, which only a native picker may do.
    const file = f("contrat.pdf");
    const out = readDrop([fileItem()], [file]);
    expect(out.files).toEqual([file]);
    expect(out.folders).toEqual([]);
  });

  it("routes a dropped FOLDER to the offer list, never to the attach list", () => {
    const out = readDrop([dirItem("Dossier client")], [f("Dossier client")]);
    expect(out.files).toEqual([]);
    expect(out.folders).toEqual([{ name: "Dossier client" }]);
  });

  it("carries the folder path ONLY as a picker hint, and only when the platform gives one", () => {
    const dir = f("Projets");
    const withHint = readDrop([dirItem("Projets")], [dir], () => "/Users/x/Projets");
    expect(withHint.folders[0]).toEqual({ name: "Projets", hintPath: "/Users/x/Projets" });
    // No platform helper (browser preview) ⇒ no hint, and the picker just opens as usual.
    expect(readDrop([dirItem("Projets")], [dir]).folders[0]).toEqual({ name: "Projets" });
  });

  it("never asks the platform for a path on a FILE — that path would have no safe use", () => {
    const pathFor = vi.fn(() => "/Users/x/contrat.pdf");
    readDrop([fileItem()], [f("contrat.pdf")], pathFor);
    expect(pathFor).not.toHaveBeenCalled();
  });

  it("splits a MIXED drop, keeping the pairing between items and files", () => {
    const a = f("a.pdf");
    const b = f("b.png");
    const out = readDrop(
      [fileItem(), dirItem("Archives"), fileItem()],
      [a, f("Archives"), b],
    );
    expect(out.files).toEqual([a, b]);
    expect(out.folders.map((d) => d.name)).toEqual(["Archives"]);
  });

  it("a dragged URL or text selection is ignored, not mistaken for a file", () => {
    const a = f("a.pdf");
    const out = readDrop([stringItem(), fileItem()], [a]);
    expect(out.files).toEqual([a]);
    expect(out.ignored).toBe(1);
  });

  it("degrades to ATTACH, never to grant, when the platform gives no items", () => {
    // A shell with no `items` cannot tell a folder apart. Falling back to "attach" is the
    // harmless direction; falling back to "offer a grant" would not be.
    const a = f("a.pdf");
    const out = readDrop([], [a]);
    expect(out.files).toEqual([a]);
    expect(out.folders).toEqual([]);
  });

  it("an item with no matching File is ignored rather than attached as undefined", () => {
    expect(readDrop([fileItem()], []).ignored).toBe(1);
  });

  it("handles an empty drop", () => {
    expect(readDrop([], [])).toEqual({ files: [], folders: [], ignored: 0 });
  });
});

describe("dragCarriesFiles", () => {
  it("judges on `types` alone — a dragover exposes no file list", () => {
    expect(dragCarriesFiles(["Files"])).toBe(true);
    expect(dragCarriesFiles(["text/plain", "Files"])).toBe(true);
    expect(dragCarriesFiles(["text/plain"])).toBe(false);
    expect(dragCarriesFiles([])).toBe(false);
  });
});

describe("the offer's wording", () => {
  const one: DroppedFolder[] = [{ name: "Contrats" }];

  it("names the folder in the singular case", () => {
    expect(folderOfferText(one)).toContain("« Contrats »");
  });

  it("counts them in the plural case", () => {
    expect(folderOfferText([{ name: "a" }, { name: "b" }])).toContain("2 dossiers");
  });

  it("says the confirmation happens in the SYSTEM dialog — the click here is not the grant", () => {
    // Tied to the invariant on purpose: if the in-app click ever became sufficient, this
    // sentence would be a lie AND `fs/grant.ts`'s contract would be broken.
    expect(FOLDER_OFFER_NOTE).toMatch(/fenêtre du système/);
    expect(FOLDER_OFFER_NOTE).toMatch(/ne peut pas s'accorder un dossier tout seul/);
  });
});
