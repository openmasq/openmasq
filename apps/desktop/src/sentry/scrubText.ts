/**
 * The free-text scrubber behind `sentry/policy.ts` — split out for the 300-LOC cap (rule 1),
 * not for reuse: `policy.ts` re-exports it and remains the ONE door. Every rule here is a
 * best-effort neutralisation of the most likely forms of personal data in an error message;
 * the residual (what a regex cannot know is a name) is documented at the top of `policy.ts`.
 *
 * Bundled into the RENDERER as well as main (`sentry/renderer.ts`), so nothing from
 * `electron`, the DB or `main/net` may be imported here — `originOfUrl` is a pinned MIRROR
 * of `main/net/egressLog.ts` for that reason.
 */
/** Max length of a kept free-text string. A useful error message fits within it;
 *  beyond that, you're copying content, not describing a failure. */
const MAX_TEXT = 300;

/**
 * Scheme + host + non-default port. A MIRROR of `main/net/egressLog.ts` `originOf` — pinned
 * value for value by `policy.test.ts` (« l'origine est CELLE du journal d'egress »).
 *
 * Deliberately a copy rather than an import: this module is also bundled into the RENDERER
 * (`sentry/renderer.ts`), and `net/egressLog.ts` is main-only code (electron + the DB sink).
 * Same rule as the egress journal, for the same reason — the query string is where a signed
 * URL's token and the agent browser's real search terms travel.
 */
function originOfUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    const defaultPort = u.protocol === "https:" ? "443" : "80";
    const port = u.port && u.port !== defaultPort ? `:${u.port}` : "";
    return `${u.protocol}//${u.hostname.toLowerCase()}${port}`;
  } catch {
    return null;
  }
}

/** Any http(s) URL, up to the first character that cannot be part of one in prose. */
const URL_RE = /https?:\/\/[^\s'"<>)\]]+/gi;

/**
 * Neutralizes the most likely forms of personal data in free text,
 * then truncates. See the residual documented at the top of the file.
 */
export function scrubText(input: unknown): string {
  if (typeof input !== "string" || !input) return "";
  return (
    input
      // A URL is reduced to its ORIGIN. Dropping only the query was half the rule: the PATH
      // carries just as much — `/invoices/2026/Marie-Morvan.pdf`, a Drive file id, a
      // conversation slug — and the agent browser navigates to real URLs about real people
      // (rule 11). Host, scheme and port answer "who did it talk to", which is the whole
      // reason a URL is worth keeping in a crash report at all.
      //
      // FIRST, before the patterns below: `originOf` drops userinfo, path, query and
      // fragment in one move, so nothing inside a URL has to be recognised pattern by
      // pattern. Run after the e-mail rule instead, `https://user:pass@host/x` had already
      // become `https://user:[courriel]/x` — no longer a parseable URL, so the path survived.
      .replace(URL_RE, (m) => originOfUrl(m) ?? "[url]")
      // A personal path carries the user's name (`/Users/first.last/…`,
      // `C:\Users\…`, `/home/…`) — we keep the DEPTH, which locates the file.
      //
      // ⚠️ The Windows branch stops at the next BACKSLASH, not at the next space: a Windows
      // account name is routinely `Jean Dupont`, and the old `\s` boundary turned
      // `C:\Users\Jean Dupont\…` into `~ Dupont\…` — the surname shipped, in the branch
      // whose entire job was to remove the name. Consuming to the separator is the only
      // boundary the path itself defines; a segment that runs into prose is over-scrubbed,
      // which is the right way for this rule to be wrong.
      .replace(/(?:\/Users\/|\/home\/)[^/\\\s)'"]+/g, "~")
      .replace(/[A-Za-z]:\\Users\\[^\\/)'"]+/g, "~")
      .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[courriel]")
      // A run of 6+ digits: IBAN, card, phone number, SIREN, identifier.
      .replace(/\d[\d\s.-]{5,}\d/g, "[nombre]")
      .slice(0, MAX_TEXT)
  );
}
