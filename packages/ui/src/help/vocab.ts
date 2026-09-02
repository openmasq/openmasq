/**
 * THE user vocabulary's retired synonyms — the words the French catalogue must no
 * longer say, because the product already has ONE word for each concept.
 *
 * Same rule as `money.ts`, applied beyond money: a synonym never comes back in a
 * redesign, it comes back one label at a time, written by someone who never saw the
 * other three. `vocab.test.ts` scans the SOURCE catalogue (`packages/i18n/src/fr/**`),
 * string literals only — a key such as `redactTypes` is code, not copy.
 *
 *  - **routine** — a skill that drives connectors. Never *workflow*.
 *  - **réglages** — the settings screen. Never *paramètres* in that sense.
 *  - **masquage / masqué** — what happens to a value. Never *redact* in a French sentence.
 *  - **connecteurs** — the services one plugs in. Never *serveurs MCP* on a title, an
 *    eyebrow or a navigation label (« MCP » stays where it is the technical term: the
 *    custom-server form, an advanced hint).
 */
export const RETIRED_VOCAB: readonly { word: string; replacement: string; pattern: RegExp }[] = [
  { word: "workflow", replacement: "routine", pattern: /\bworkflows?\b/i },
  { word: "paramètres", replacement: "réglages", pattern: /\bparam[èe]tres?\b/i },
  { word: "redact", replacement: "masquage", pattern: /redact/i },
  { word: "serveurs MCP", replacement: "connecteurs", pattern: /\bserveurs?\s+MCP\b/i },
];

/**
 * The legitimate uses — each one exact, each one with its reason. An exemption is a
 * SUBSTRING removed before the scan, never a file: a file exemption would amnesty a real
 * « vos workflows » landing in the same file later.
 */
export const VOCAB_ALLOWED: readonly { text: string; why: string }[] = [
  {
    text: "Paramètres → Developer Settings",
    why: "Fireflies' own menu, quoted as the site shows it (mcpTab.ts, key steps)",
  },
  {
    text: "domaine, chemin et paramètres",
    why: "URL parameters — the technical sense, not the settings screen (redactionCatalog.ts)",
  },
];

/**
 * Files whose literals DESCRIBE a third party in its own words: the connector
 * catalogue says « workflows sans code » about Zapier because Zapier does.
 */
export const VOCAB_EXEMPT_FILES: readonly { file: string; why: string }[] = [
  { file: "connectors.ts", why: "third-party product descriptions, in the vendor's own vocabulary" },
];

/** Every string literal of a TypeScript source, comments and code excluded. Literals
 *  that are bare identifiers (`"redactTypes"` in a `satisfies`) are code, and skipped;
 *  so are ⌘K `keywords`, whose whole job is to catch the words people still type. */
export function copyLiterals(source: string): string[] {
  // Comments first: a doc header quoting `@openmasq/redact` in backticks is not copy.
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const withoutKeywords = withoutComments.replace(
    /\bkeywords:\s*(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`[^`]*`)/g,
    "",
  );
  const out: string[] = [];
  const re = /"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(withoutKeywords))) {
    const lit = m[1] ?? m[2] ?? m[3] ?? "";
    if (/^[A-Za-z_$][\w$]*$/.test(lit)) continue;
    out.push(lit);
  }
  return out;
}
