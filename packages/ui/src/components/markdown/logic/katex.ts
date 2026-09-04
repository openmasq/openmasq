import { useEffect, useState } from "react";

/**
 * Models emit math with various delimiters. remark-math only understands `$…$`
 * and `$$…$$`, so convert the common `\(…\)` / `\[…\]` forms (used by ChatGPT &
 * Claude). Skip anything inside fenced/inline code so code samples are untouched.
 */
export function normalizeMath(input: string): string {
  const parts = input.split(/(```[\s\S]*?```|`[^`]*`)/g);
  return parts
    .map((part, i) =>
      i % 2 === 1 // odd parts are the captured code spans/blocks
        ? part
        : part
            .replace(/\\\[([\s\S]+?)\\\]/g, (_m, e) => `$$${e}$$`)
            .replace(/\\\(([\s\S]+?)\\\)/g, (_m, e) => `$${e}$`),
    )
    .join("");
}

// KaTeX (rehype-katex) pulls in the whole katex renderer — heavy, and never needed
// at launch (an empty chat has no math). Lazy-`import()` it on the first Markdown
// mount so it code-splits out of the initial renderer chunk. `useKatexPlugin` returns
// the plugin once loaded (null until then); `remark-math` (tiny) stays eager, so
// before KaTeX lands math shows as its raw LaTeX and upgrades to rendered math a tick
// later — first occurrence only, since the module-level cache makes it instant after.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type KatexPlugin = any; // react-markdown's Pluggable typing is loose (as in the original)
let katexPlugin: KatexPlugin | null = null;
let katexPromise: Promise<KatexPlugin> | null = null;
function loadKatex(): Promise<KatexPlugin> {
  if (!katexPromise) {
    katexPromise = import("rehype-katex").then((m) => {
      katexPlugin = m.default;
      return katexPlugin;
    });
  }
  return katexPromise;
}

/**
 * The options every KaTeX render in the app runs under — one object, so the guards
 * below cannot be present on one call site and missing on the next.
 *
 * ⚠️ SECURITY — the LaTeX we typeset is MODEL output, i.e. attacker-influenceable
 * (an injected page can dictate a formula verbatim), and KaTeX's defaults are sized
 * for a document you wrote yourself:
 *  - `maxSize` defaults to **Infinity**, so `\rule{9999999em}{9999999em}` renders a
 *    box millions of ems wide — the layout is destroyed and the reply unreadable.
 *    10em bounds any single element to something that still fits a bubble.
 *  - `maxExpand` bounds macro expansion, i.e. the "billion laughs" of TeX: a
 *    self-referential `\def` otherwise spins the render thread forever.
 *  - `trust` is already effectively false (undefined), which is what refuses
 *    `\href`/`\url`/`\includegraphics`. Stated EXPLICITLY so a future change of
 *    KaTeX's default cannot silently hand the model an anchor factory.
 * `throwOnError: false` renders malformed/partial LaTeX inert instead of throwing
 * (math arrives mid-stream); `strict: false` tolerates the loose LaTeX models write.
 * Pinned by `katex.test.ts`.
 */
export const KATEX_OPTIONS = {
  throwOnError: false,
  strict: false,
  maxSize: 10,
  maxExpand: 1000,
  trust: false,
} as const;

export function useKatexPlugin(): KatexPlugin | null {
  const [plugin, setPlugin] = useState<KatexPlugin | null>(katexPlugin);
  useEffect(() => {
    if (plugin) return;
    let alive = true;
    void loadKatex().then((p) => {
      if (alive) setPlugin(() => p);
    });
    return () => {
      alive = false;
    };
  }, [plugin]);
  return plugin;
}
