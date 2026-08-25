import { Fragment, useEffect, useMemo, useState } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
import { toJsxRuntime } from "hast-util-to-jsx-runtime";
import { highlightCode, highlightCodeSync, highlighterReady } from "../logic/codeHighlight";

/**
 * Render `code` with syntax highlighting (lowlight → `.hljs-*` token spans, themed
 * in styles.css) when the fence language is recognised; otherwise the plain text.
 * Presentation only — the highlight logic lives in `codeHighlight.ts`.
 *
 * lowlight (highlight.js) is LAZY-loaded (kept out of the launch bundle): until the
 * FIRST code block in a session triggers the load, this renders the plain code and
 * re-renders highlighted once ready; thereafter it highlights synchronously (cached),
 * so streaming re-renders don't flicker.
 */
export function SyntaxHighlight({ code, lang }: { code: string; lang?: string }) {
  // Re-render once the lazy highlighter has loaded on first use. `ready` seeds true
  // when a previous block already loaded it, so a later block highlights immediately.
  const [ready, setReady] = useState(highlighterReady());
  useEffect(() => {
    if (highlighterReady()) return;
    let alive = true;
    void highlightCode(code, lang).then(() => {
      if (alive) setReady(true);
    });
    return () => {
      alive = false;
    };
  }, [ready, code, lang]);

  // Tokenising is O(code length) and building the JSX tree walks it again — both are
  // synchronous, so an unmemoised render re-highlights every mounted block. `ready`
  // is a dep because the lazy highlighter flipping in is exactly what turns a plain
  // block into a highlighted one.
  const tree = useMemo(() => highlightCodeSync(code, lang), [code, lang, ready]);
  const rendered = useMemo(
    () => (tree ? toJsxRuntime(tree, { Fragment, jsx, jsxs }) : null),
    [tree],
  );
  if (!tree) return <>{code}</>;
  return <>{rendered}</>;
}
