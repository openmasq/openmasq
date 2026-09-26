// The web search engines, by EXACT host. Two decisions read it: the renderer's exfil scan
// (`packages/ui/src/state/browserPolicy/exfil.ts`), where a real value in a search box is
// the search the user asked for and so not a finding, and main's Google → DuckDuckGo rewrite.
// An ALLOW-list of hosts, never a name pattern: `bing.evil.io` and
// `www.google.com.attacker.example` both carry a search engine's name, and neither is one.

/** Google's own country domains — the ones a search actually lands on. */
const GOOGLE_TLDS = [
  "com", "fr", "de", "es", "it", "nl", "be", "ch", "at", "pt", "pl", "se", "no", "dk", "fi", "ie",
  "co.uk", "ca", "com.au", "co.nz", "co.jp", "co.in", "com.br", "com.mx", "com.ar", "lu",
];

export const SEARCH_ENGINE_HOSTS: ReadonlySet<string> = new Set([
  ...GOOGLE_TLDS.map((t) => `google.${t}`),
  "bing.com",
  "duckduckgo.com",
  // Its no-JavaScript pages: the web-fetch tool searches through `html.`.
  "html.duckduckgo.com",
  "lite.duckduckgo.com",
  "search.yahoo.com",
  "ecosia.org",
  "search.brave.com",
  "startpage.com",
  "qwant.com",
  "baidu.com",
  "yandex.com",
  "yandex.ru",
]);

const bare = (hostname: string): string => hostname.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");

/** Is this hostname a search engine's own (`www.` or not)? */
export function isSearchEngineHost(hostname: string): boolean {
  return SEARCH_ENGINE_HOSTS.has(bare(hostname));
}

/** Is this hostname one of Google's own search domains? */
export function isGoogleSearchHost(hostname: string): boolean {
  const h = bare(hostname);
  return h.startsWith("google.") && SEARCH_ENGINE_HOSTS.has(h);
}
