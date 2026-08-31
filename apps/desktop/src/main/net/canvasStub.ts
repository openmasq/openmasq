/**
 * Stub for `canvas` in the MAIN bundle — `linkedom`'s optional peer.
 *
 * linkedom keeps `canvas` behind a try/catch at runtime (absent ⇒ its own
 * pure shim). But vite replaces an uninstalled optional peer with a module that
 * THROWS unconditionally at load (`__viteOptionalPeerDep_canvas_linkedom`),
 * hoisted OUT of the original try/catch: the build passed, the app died at boot.
 * The alias (electron.vite.config.ts) therefore resolves `canvas` to this stub, which reproduces
 * the shape of linkedom's fallback (`linkedom/commonjs/canvas-shim.cjs`) — the same
 * degradation linkedom would have chosen. Our usage (Readability, pure parsing)
 * never draws: the stub is only reached if a page contains a <canvas>.
 * `apps/desktop/scripts/check-bundle.mjs` forbids the return of this class of bug.
 */
class CanvasStub {
  width: number;
  height: number;
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }
  getContext(): null {
    return null;
  }
  toDataURL(): string {
    return "";
  }
}

export const createCanvas = (width: number, height: number): CanvasStub => new CanvasStub(width, height);
