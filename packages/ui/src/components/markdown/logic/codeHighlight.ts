import type { Root } from "hast";

/**
 * Syntax highlighting for fenced code — lowlight (highlight.js) → a hast tree of
 * `.hljs-*` token spans, themed in `styles.css`. Pure logic (no React); the
 * `SyntaxHighlight` component renders the tree. Bundled + offline (no CDN → CSP-safe).
 *
 * We only highlight when the fence's language is KNOWN (no `highlightAuto` — auto-
 * detect mis-guesses short snippets and costs CPU on every streamed re-render).
 *
 * ⚡ **lowlight is LAZY-loaded.** `lowlight` bundles highlight.js's whole `common`
 * language set (~hundreds of KB) — dead weight on an empty chat at launch. It's
 * dynamically `import()`ed on the FIRST code block that needs highlighting
 * (`loadLowlight`), so it code-splits out of the initial renderer chunk. Until it
 * lands, `SyntaxHighlight` shows the plain code and upgrades once ready; after that
 * the cached instance highlights SYNCHRONOUSLY (`highlightCodeSync`), identical to
 * before. `resolveLang`/`canHighlight` stay synchronous via a STATIC language set
 * (below) so `CodeBlock` can decide its layout with zero lowlight loaded.
 */

/** highlight.js's `common` bundle language names — the exact set `createLowlight(common)`
 *  registers. Kept STATIC so `resolveLang`/`canHighlight` answer without loading lowlight;
 *  a drift only degrades gracefully (unknown → plain text, never a crash). */
const COMMON_LANGS = new Set<string>([
  "bash", "c", "cpp", "csharp", "css", "diff", "go", "graphql", "ini", "java",
  "javascript", "json", "kotlin", "less", "lua", "makefile", "markdown",
  "objectivec", "perl", "php", "php-template", "plaintext", "python",
  "python-repl", "r", "ruby", "rust", "scss", "shell", "sql", "swift",
  "typescript", "vbnet", "wasm", "xml", "yaml",
]);

/** Short fence tags → the highlight.js `common` language name (aliases it doesn't
 *  already resolve). Anything not resolvable → no highlight (plain text). */
const ALIAS: Record<string, string> = {
  js: "javascript", mjs: "javascript", cjs: "javascript", jsx: "javascript",
  ts: "typescript", tsx: "typescript",
  py: "python", py3: "python", rb: "ruby", golang: "go", rs: "rust",
  sh: "bash", zsh: "bash", shell: "bash", console: "bash",
  yml: "yaml", md: "markdown", mdown: "markdown",
  html: "xml", htm: "xml", xhtml: "xml", svg: "xml", vue: "xml",
  "c++": "cpp", cc: "cpp", cxx: "cpp", hpp: "cpp", "c#": "csharp", cs: "csharp",
  kt: "kotlin", toml: "ini", conf: "ini", text: "plaintext", txt: "plaintext",
  jsonc: "json", "objective-c": "objectivec", "obj-c": "objectivec",
};

/** Resolve a fence tag to a lowlight-registered language, or "" when unsupported. */
export function resolveLang(lang?: string): string {
  if (!lang) return "";
  const l = lang.toLowerCase();
  const name = ALIAS[l] ?? l;
  return COMMON_LANGS.has(name) ? name : "";
}

/** True when a fence's language can be highlighted (drives the `hljs` class + header). */
export function canHighlight(lang?: string): boolean {
  return resolveLang(lang) !== "";
}

// ── Lazy lowlight singleton ──────────────────────────────────────────────────
type Lowlight = { highlight(name: string, code: string): Root };
let lowlight: Lowlight | null = null;
let lowlightP: Promise<Lowlight> | null = null;

/** Dynamically import lowlight + highlight.js `common` ONCE (code-split out of the
 *  initial bundle). Resolves to the shared instance; caches it for the sync path. */
export function loadLowlight(): Promise<Lowlight> {
  if (!lowlightP) {
    lowlightP = import("lowlight").then(({ common, createLowlight }) => {
      lowlight = createLowlight(common);
      return lowlight;
    });
  }
  return lowlightP;
}

/** True once lowlight has finished loading (the sync path is then available). */
export function highlighterReady(): boolean {
  return lowlight !== null;
}

/** Highlight `code` SYNCHRONOUSLY — only works once lowlight is loaded (else null,
 *  caller renders plain). NEVER throws. */
export function highlightCodeSync(code: string, lang?: string): Root | null {
  const name = resolveLang(lang);
  if (!name || !code || !lowlight) return null;
  try {
    return lowlight.highlight(name, code);
  } catch {
    return null;
  }
}

/** Highlight `code` → a hast tree of `.hljs-*` spans, or null when the language is
 *  unsupported / the code is empty (caller renders plain). Lazy-loads lowlight on
 *  first use. NEVER throws. */
export async function highlightCode(code: string, lang?: string): Promise<Root | null> {
  const name = resolveLang(lang);
  if (!name || !code) return null;
  try {
    const ll = lowlight ?? (await loadLowlight());
    return ll.highlight(name, code);
  } catch {
    return null;
  }
}
