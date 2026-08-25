/**
 * Stub de `canvas` pour le bundle MAIN — le pair optionnel de `linkedom`.
 *
 * linkedom garde `canvas` derrière un try/catch à l'exécution (absent ⇒ son propre
 * shim pur). Mais vite remplace un pair optionnel non installé par un module qui
 * JETTE inconditionnellement au chargement (`__viteOptionalPeerDep_canvas_linkedom`),
 * hissé HORS du try/catch d'origine : le build passait, l'app mourait au boot.
 * L'alias (electron.vite.config.ts) résout donc `canvas` vers ce stub, qui reproduit
 * la forme du repli de linkedom (`linkedom/commonjs/canvas-shim.cjs`) — la même
 * dégradation que linkedom aurait choisie. Notre usage (Readability, parsing pur)
 * ne dessine jamais : le stub n'est atteint que si une page contient un <canvas>.
 * `apps/desktop/scripts/check-bundle.mjs` interdit le retour de cette classe de bug.
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
