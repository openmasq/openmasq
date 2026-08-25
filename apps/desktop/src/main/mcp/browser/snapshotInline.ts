// Inline @playwright/mcp's externalised output files back into a tool result.
//
// WHY: in @playwright/mcp 0.0.77, an ACTION tool (browser_navigate/click/…) always
// writes the page accessibility snapshot (and console/network logs) to a
// `page-<ts>.yml` / `*.log` file and returns ONLY a markdown link — never the
// content inline (that path is hardcoded; only the explicit `browser_snapshot`
// tool inlines). So the model receives no page content after a navigation and
// can't answer "what's on the page" (the reported web-search bug). We read the
// linked file back (it lives in OUR temp output dir) and fold its content into
// the result text, keyed by the link's BASENAME so a `../` link can't escape the
// dir. Pure (no fs / no electron) so it's unit-testable; the fs + delete wrapper
// lives in `mcp/index.ts`.

/** Fresh regex per call (avoids shared `lastIndex` state between matchAll/replace).
 *  Matches one externalised-output markdown link per line:
 *    `- [Snapshot](../../…/page-2026-….yml)` · `- [Console](…/x.log)` · `[t](y.yml)` */
function outputLinkRegex(): RegExp {
  return /^(?:[ \t]*[-*][ \t]*)?\[[^\]]+\]\(([^)]+?\.(?:yml|log))\)[ \t]*$/gm;
}

/** The distinct file basenames referenced by externalised-output links in `text`. */
export function outputLinkBasenames(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(outputLinkRegex())) {
    const base = m[1].split(/[\\/]/).pop();
    if (base) out.push(base);
  }
  return [...new Set(out)];
}

/** Replace each externalised-output link with the fenced content its file holds,
 *  looked up via `read(basename)` (null → leave the link untouched, no regression).
 *  Returns the rewritten text + the basenames actually inlined (to delete). */
export function inlineOutputLinks(
  text: string,
  read: (basename: string) => string | null | undefined,
): { text: string; inlined: string[] } {
  const inlined: string[] = [];
  const out = text.replace(outputLinkRegex(), (full, link: string) => {
    const base = link.split(/[\\/]/).pop() || "";
    if (!base) return full;
    const content = read(base);
    if (content == null) return full;
    inlined.push(base);
    const lang = base.endsWith(".yml") ? "yaml" : "";
    return "```" + lang + "\n" + content.trim() + "\n```";
  });
  return { text: out, inlined: [...new Set(inlined)] };
}
