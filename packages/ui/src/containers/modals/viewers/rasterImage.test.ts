import { describe, expect, it } from "vitest";
import { kindOf } from "./fileKind";
import { libKindOf } from "../../../pages/Library/libraryKinds";

/** One raster rule for every surface that decides "this is a picture": an SVG (a document with
 *  its own script and fetch surface) is never one, whether it arrives by mime or by name. */
describe("what counts as an image", () => {
  it("raster formats, by mime or by name, in the viewer and the library", () => {
    for (const [mime, name] of [["image/png", "a"], ["", "a.JPG"], ["image/avif", "a"], ["", "b.avif"]]) {
      expect(kindOf(mime, name), `${mime} ${name}`).toBe("image");
      expect(libKindOf(mime, name), `${mime} ${name}`).toBe("image");
    }
  });
  it("never an SVG", () => {
    for (const [mime, name] of [["image/svg+xml", "a"], ["", "a.svg"], ["image/svg+xml", "a.svg"]]) {
      expect(kindOf(mime, name)).not.toBe("image");
      expect(libKindOf(mime, name)).not.toBe("image");
    }
  });
});
