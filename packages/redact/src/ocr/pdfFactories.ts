/**
 * The canvas and filter factories pdf.js renders with, handed to `getDocument` EXPLICITLY.
 *
 * ⚠️ pdf.js picks its defaults from `isNodeJS`, which is FALSE in an Electron
 * `utilityProcess` (`process.type === "utility"`, only "browser" counts as Node). It then
 * falls back to the DOM factories, and the first scratch canvas a page asks for (an image
 * mask, a pattern, a soft mask) throws « Cannot read properties of undefined (reading
 * 'createElement') » — there is no `document` there. The extraction worker IS such a
 * process, so every page painting an image failed its OCR. These factories never touch a
 * DOM: canvases come from `@napi-rs/canvas`, filters are no-ops (what pdf.js's own Node
 * filter factory does). `pdfFactories.test.ts`.
 */
type CanvasModule = { createCanvas: (w: number, h: number) => any };

export function pdfRenderFactories(canvasMod: CanvasModule) {
  class CanvasFactory {
    #willReadFrequently: boolean;
    constructor({ enableHWA = false }: { enableHWA?: boolean } = {}) {
      this.#willReadFrequently = !enableHWA;
    }
    create(width: number, height: number) {
      if (width <= 0 || height <= 0) throw new Error("Invalid canvas size");
      const canvas = canvasMod.createCanvas(width, height);
      return { canvas, context: canvas.getContext("2d", { willReadFrequently: this.#willReadFrequently }) };
    }
    reset(cc: { canvas: any }, width: number, height: number) {
      if (!cc.canvas) throw new Error("Canvas is not specified");
      if (width <= 0 || height <= 0) throw new Error("Invalid canvas size");
      cc.canvas.width = width;
      cc.canvas.height = height;
    }
    destroy(cc: { canvas: any; context: any }) {
      if (!cc.canvas) throw new Error("Canvas is not specified");
      cc.canvas.width = cc.canvas.height = 0;
      cc.canvas = null;
      cc.context = null;
    }
  }
  class FilterFactory {
    addFilter() {
      return "none";
    }
    addHCMFilter() {
      return "none";
    }
    addAlphaFilter() {
      return "none";
    }
    addLuminosityFilter() {
      return "none";
    }
    addKnockoutFilter() {
      return "none";
    }
    addHighlightHCMFilter() {
      return "none";
    }
    addSelectionHCMFilter() {
      return "none";
    }
    addSelectionFilter() {
      return "none";
    }
    createSelectionStyle() {
      return null;
    }
    destroy() {}
  }
  return { CanvasFactory, FilterFactory };
}
