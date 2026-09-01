import {
  siDuckduckgo,
  siBrave,
  siGoogle,
  siEcosia,
  siStartpage,
  siQwant,
} from "simple-icons";

/**
 * The integrated-browser search engines the user can pick from (in the browser
 * panel's engine dropdown + the "Navigateur" settings tab). Pure data — the tab
 * strip / settings render it, and `resolveTarget` (BrowserPanel) turns a free-text
 * query into a URL on the CHOSEN engine.
 *
 * Every host here is already recognised by `browserPolicy.SEARCH_ENGINE_HOSTS`, so
 * a legitimately-long `?q=` search phrase stays exempt from the exfil heuristic.
 * Brand glyphs come from the open-source `simple-icons` set (accurate official
 * marks; trademarks belong to their owners — shown only to identify the engine),
 * same source as `mcpLogos.ts`, so they're asset-free + CSP-safe.
 */
export interface SearchEngine {
  id: string;
  name: string;
  /** Build a search URL for a free-text query. */
  search: (q: string) => string;
  /** 24×24 single-path brand glyph. */
  path: string;
  /** Official brand colour (used for the tile tint). */
  hex: string;
}

const q = (v: string) => encodeURIComponent(v);

export const SEARCH_ENGINES: SearchEngine[] = [
  {
    id: "duckduckgo",
    name: "DuckDuckGo",
    search: (v) => `https://duckduckgo.com/?q=${q(v)}`,
    path: siDuckduckgo.path,
    hex: `#${siDuckduckgo.hex}`,
  },
  {
    id: "brave",
    name: "Brave",
    search: (v) => `https://search.brave.com/search?q=${q(v)}`,
    path: siBrave.path,
    hex: `#${siBrave.hex}`,
  },
  {
    id: "google",
    name: "Google",
    search: (v) => `https://www.google.com/search?q=${q(v)}`,
    path: siGoogle.path,
    hex: `#${siGoogle.hex}`,
  },
  {
    id: "ecosia",
    name: "Ecosia",
    search: (v) => `https://www.ecosia.org/search?q=${q(v)}`,
    path: siEcosia.path,
    hex: `#${siEcosia.hex}`,
  },
  {
    id: "startpage",
    name: "Startpage",
    search: (v) => `https://www.startpage.com/sp/search?query=${q(v)}`,
    path: siStartpage.path,
    hex: `#${siStartpage.hex}`,
  },
  {
    id: "qwant",
    name: "Qwant",
    search: (v) => `https://www.qwant.com/?q=${q(v)}`,
    path: siQwant.path,
    hex: `#${siQwant.hex}`,
  },
];

/** The engine used when the user hasn't chosen one. */
export const DEFAULT_SEARCH_ENGINE = "duckduckgo";

/** Resolve an engine id to its config, falling back to the default. The fallback
 *  resolves DEFAULT_SEARCH_ENGINE by id — never `[0]` alone, which only matched the
 *  default by ARRAY-ORDER coincidence and would drift silently on a reorder. */
export function searchEngineById(id: string | undefined): SearchEngine {
  return (
    SEARCH_ENGINES.find((e) => e.id === id) ??
    SEARCH_ENGINES.find((e) => e.id === DEFAULT_SEARCH_ENGINE) ??
    SEARCH_ENGINES[0]
  );
}

/** Build the search URL for `query` on the chosen (or default) engine. */
export function searchUrl(engineId: string | undefined, query: string): string {
  return searchEngineById(engineId).search(query);
}
