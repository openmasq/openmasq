// The `devTools` preference is PER-WINDOW: a window created without it falls back to
// Electron's default (`true`) with nothing turning red — and the seventh window, the
// one we'll add in six months, is exactly the one that will forget it. So this test scans
// main: any file that CREATES a window or a view must reference `DEVTOOLS_PREF`.
// (Text scan, not an import: the module reads `app.isPackaged` at import time, and it's the
// same method as `clientApp.parity.test.ts` — a comment can't fail in CI.)
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const MAIN = dirname(fileURLToPath(import.meta.url));

function* sources(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* sources(p);
    else if (p.endsWith(".ts") && !p.endsWith(".test.ts")) yield p;
  }
}

describe("toute fenêtre du main porte la politique DevTools", () => {
  it("aucun `new BrowserWindow` / `new WebContentsView` sans DEVTOOLS_PREF", () => {
    const oublis: string[] = [];
    for (const file of sources(MAIN)) {
      const src = readFileSync(file, "utf8");
      if (!/new (BrowserWindow|WebContentsView|BaseWindow)\(/.test(src)) continue;
      if (!src.includes("DEVTOOLS_PREF")) oublis.push(relative(MAIN, file));
    }
    expect(oublis, `fenêtre(s) sans politique DevTools — voir devtools.ts : ${oublis.join(", ")}`).toEqual([]);
  });
});
