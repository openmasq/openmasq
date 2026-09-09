// The page and its stylesheet, read from disk beside this module. They are ASSETS, not code:
// `index.html` is the design system's `cli-logs` kit with its mock data replaced by a live
// stream, and `tokens.css` is generated from the product's own token files
// (`scripts/gen-console-tokens.mjs`). Keeping them as files is what lets the kit be diffed
// against its source instead of drifting inside a template string.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const read = (name: string): string => readFileSync(join(here, name), "utf8");

/** The brand marks, inlined: the page fetches nothing, from anywhere. The kit ships two —
 *  one per theme — and its CSS shows the right one, so both are inlined with their classes. */
function mark(name: string, cls: string): string {
  try {
    return read(name).replace("<svg", `<svg class="${cls}"`);
  } catch {
    return "";
  }
}

let css: string | undefined;

/**
 * The mount path, injected as a `<base>`. Without it the page's relative URLs resolve against
 * `/console` (no trailing slash), so `./tokens.css` becomes `/tokens.css` — a 404, an
 * unstyled page and a stream that never connects. A redirect to `/console/` would work too;
 * a base tag is one line and does not depend on the caller having typed the slash.
 */
const BASE = '<base href="/console/">';

/**
 * `token` is threaded into the stylesheet's own URL. Every route is behind the token, and a
 * `<link href="./tokens.css">` carries no query — so the sheet 404'd, every `var(--…)` fell
 * back to nothing, and the page rendered as black text on white. Found by opening it.
 */
export function renderPage(token: string): string {
  return read("index.html")
    .replace("<!--MARK-->", mark("mark.svg", "m-light"))
    .replace("<!--MARK-DARK-->", mark("mark-dark.svg", "m-dark"))
    .replace("<head>", `<head>\n${BASE}`)
    .replace('href="./tokens.css"', `href="./tokens.css?t=${encodeURIComponent(token)}"`);
}

export function tokensCss(): string {
  css ??= read("tokens.css");
  return css;
}
