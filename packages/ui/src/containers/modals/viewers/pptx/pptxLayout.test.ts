import { describe, it, expect } from "vitest";
import { bulletFor, frameCss, paraCss, slideBoxCss, slidePlaneCss, slideScale, textShapeCss } from "./pptxLayout";
import type { PptxPara, PptxTextShape } from "./pptxModel";

const para = (over: Partial<PptxPara> = {}): PptxPara => ({ runs: [], level: 0, ...over });
const shape = (over: Partial<PptxTextShape> = {}): PptxTextShape => ({
  kind: "text",
  frame: { x: 10, y: 20, w: 100, h: 50 },
  paras: [],
  ...over,
});

describe("slideScale", () => {
  it("fits a slide into the panel", () => {
    expect(slideScale(1280, 640)).toBe(0.5);
  });

  it("never upscales past 1", () => {
    // A slide blown up beyond its authored size reads as a rendering bug, and the
    // preview panel is not a projector.
    expect(slideScale(1280, 2560)).toBe(1);
  });

  it("returns 1 before the container is measured", () => {
    // availWidth is 0 on the first paint. Scaling by 0 would collapse the slide to
    // nothing and flash an empty deck.
    expect(slideScale(1280, 0)).toBe(1);
  });
});

describe("slide box vs plane", () => {
  it("reserves the SCALED footprint on the outer box", () => {
    // `transform` does not affect layout: without this the page reserves the slide's
    // full unscaled height and leaves a gap under every slide.
    expect(slideBoxCss(1280, 720, 0.5)).toEqual({ width: "640px", height: "360px" });
  });

  it("keeps the plane at TRUE size and scales it as one unit", () => {
    // Geometry (px) and type (pt) must scale together — that is the whole reason the
    // render is a transform rather than percentage positioning.
    expect(slidePlaneCss(1280, 720, 0.5)).toMatchObject({
      width: "1280px",
      height: "720px",
      transform: "scale(0.5)",
      transformOrigin: "top left",
    });
  });
});

describe("frameCss", () => {
  it("places a shape at its own coordinates", () => {
    expect(frameCss({ x: 10, y: 20, w: 100, h: 50 })).toMatchObject({
      left: "10px",
      top: "20px",
      width: "100px",
      height: "50px",
    });
  });

  it("emits no transform when the shape is not rotated", () => {
    expect(frameCss({ x: 0, y: 0, w: 1, h: 1 }).transform).toBeUndefined();
    expect(frameCss({ x: 0, y: 0, w: 1, h: 1, rot: 45 }).transform).toBe("rotate(45deg)");
  });
});

describe("textShapeCss", () => {
  it("maps the body anchor onto flex justification", () => {
    // PowerPoint anchors text in the BOX, not in its own line box.
    expect(textShapeCss(shape({ anchor: "center" })).justifyContent).toBe("center");
    expect(textShapeCss(shape({ anchor: "bottom" })).justifyContent).toBe("flex-end");
    expect(textShapeCss(shape()).justifyContent).toBe("flex-start");
  });

  it("applies the body insets as padding", () => {
    expect(textShapeCss(shape({ pad: { l: 9, t: 5, r: 9, b: 5 } })).padding).toBe("5px 9px 5px 9px");
  });
});

describe("paraCss / bulletFor", () => {
  it("indents by outline level", () => {
    expect(paraCss(para({ level: 2 })).marginLeft).toBe("48px");
    expect(paraCss(para()).marginLeft).toBeUndefined();
  });

  it("renders a literal bullet char", () => {
    expect(bulletFor(para({ bullet: "•" }), 1)).toBe("•");
    expect(bulletFor(para(), 1)).toBe("");
  });

  it("numbers an auto-numbered bullet from the renderer's count", () => {
    // The parser cannot know the number: it depends on the paragraph's position among
    // its numbered siblings, which only the render walk counts.
    expect(bulletFor(para({ bullet: "#" }), 3)).toBe("3.");
  });
});
