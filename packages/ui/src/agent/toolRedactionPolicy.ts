import { BRAND } from "@openmasq/branding";
/**
 * Which redaction categories a tool RESULT keeps IN CLEAR, by connector — pure so it's
 * unit-testable (the policy used to be inline + untested in `store.ts`).
 *
 * A PUBLIC web-search connector (Firecrawl/Exa/Tavily) returns pages whose place +
 * organisation names ARE the answer's substance, and whose path/key-shaped tokens are
 * URL/asset paths + CDN cache-busters (not the user's data) — redacting them made the
 * model summarise gibberish and flooded the audit. So those categories are left in clear.
 *
 * ⚠️ The controllable BROWSER is different: it can be driven onto a PRIVATE, authenticated
 * SaaS page where a real credential / filesystem path may be VISIBLE (a GitHub PAT page,
 * an AWS console key, a webhook secret). So for the browser we keep `secret`/`apikey`/
 * `path` REDACTED — only the public-content kinds (place/org names) are cleared. Leaking a
 * real key to the model is far worse than a bit of audit noise on org/place names.
 */

/**
 * ⚠️ These rules govern the INBOUND leg ONLY — what a tool RESULT keeps in clear on its way
 * to the model. There is no outbound counterpart, and adding one is the bug root rule 11
 * names: every connector, the browser INCLUDED, un-redacts every argument, because the
 * outside must always receive the REAL value. A search for a fake name answers about nobody.
 */

/** Kinds a public web-SEARCH connector's results keep in clear. */
export const SEARCH_CLEAR = ["location", "company", "path", "apikey", "secret"];

/** Kinds the controllable browser's results keep in clear — NARROWER than search: the
 *  browser can read authenticated pages, so credentials/paths stay redacted. */
export const BROWSER_CLEAR = ["location", "company"];

/** The built-in batch web reader (`web_fetch_many`) — fetches untrusted public pages
 *  over `safeFetch` (no cookies, so it can't reach authenticated pages). It gets the
 *  SAME narrow clear policy as the browser: place/org read as content, but
 *  secret/apikey/path stay REDACTED (a public page can still expose a leaked key). */
export const WEB_FETCH_MANY_TOOL = "web_fetch_many";

/**
 * The extra categories to leave in clear for a tool result, given its connector id,
 * whether that connector is a public-search connector (`category === "search"`, resolved
 * by the caller from the catalog), and whether the tool is a BROWSER-automation tool
 * (integrated OR third-party, resolved by the caller from the `browser_*` tool name).
 * Empty for every ordinary connector — nothing extra is cleared, so all PII stays redacted.
 */
export function toolClearKinds(
  connectorId: string | undefined,
  isSearchConnector: boolean,
  isBrowser = false,
): string[] {
  if (!connectorId) return [];
  // A BROWSER (integrated `browser` OR a third-party BrowserMCP-style connector) keeps
  // only place/org in clear — it can read AUTHENTICATED pages, so secret/apikey/path
  // stay REDACTED. A pure public SEARCH connector clears the broader set.
  if (connectorId === "browser" || connectorId === WEB_FETCH_MANY_TOOL || isBrowser) return BROWSER_CLEAR;
  if (isSearchConnector) return SEARCH_CLEAR;
  return [];
}

// ── Tool-DISCOVERY metadata keep-list ───────────────────────────────────────
// A META-tool (posthog's `exec`, some Zapier/Sentry setups) re-exposes tool
// DISCOVERY as tool-call RESULTS: a list of tool NAMES, a tool `info` block, a
// search of tool names. The redaction NER then tags those API identifiers as
// org/company and VAULTS them — `execute-sql → jade-tom`, `ClickHouse → Brightpath`,
// `MCP → COR`, `read-data-schema → …` — so the model can no longer discover OR call
// the right tool: it searches, gets mangled names back, and LOOPS (measured on the
// eval bench). These are PUBLIC API surface, never the user's PII, so — exactly like
// the run_python framework keep — they stay in clear.
//
// SAFETY (this is the redaction boundary, rule 7/11). THREE guards, all required:
//  1. SCOPE: only a DISCOVERY-shaped result (`isToolDiscoveryResult`) — a tool-INFO
//     block, a Supported-commands hint, or a payload DOMINATED by tool-name-shaped
//     ids. A `call`/DATA result (dashboard names, event rows) is NOT discovery and is
//     left FULLY redacted — a dashboard name like "starter dashboard" stays redacted.
//  2. SHAPE: only kebab tool-name ids (`execute-sql`) + a small PUBLIC tech-term set
//     are spared — a shape a hard-PII value (name/email/phone/iban/card/address)
//     CANNOT take. So even a false-positive scope can only ever spare an API token.
//  3. VAULT: never spare a value the vault already holds as REAL (a real PII in a
//     mixed result) — same fail-safe as `pythonFrameworkKeep` guard 3.

// A tool-name shape: lowercase word(s) joined by hyphen(s) — `execute-sql`,
// `read-data-schema`, `query-trends`, `find-organizations`. Never a person/email/etc.
const TOOL_NAME_ID = /\b[a-z][a-z0-9]*(?:-[a-z0-9]+)+\b/g;
// Public technical terms a NER routinely mis-tags as an org, from a tool description.
const TECH_TERM = /\b(?:ClickHouse|HogQL|PostgreSQL|MySQL|GraphQL|OAuth|SDK|CRUD|HogQL)\b/g;
// The result IS tool-discovery metadata: an `info` block (schema/annotations), a
// Supported-commands error hint, or a payload where kebab tool-name ids DOMINATE.
const DISCOVERY_MARKER = /inputSchema|Supported commands:|(?:readOnly|destructive|idempotent)Hint/;

/** Does this tool RESULT look like tool-DISCOVERY metadata (not a data result)? */
export function isToolDiscoveryResult(text: string): boolean {
  if (DISCOVERY_MARKER.test(text)) return true;
  // A listing where tool-name ids are the BULK of the content (`tools`/`search`).
  const ids = text.match(TOOL_NAME_ID);
  if (ids && ids.length >= 8 && ids.join("").length / text.length > 0.5) return true;
  return false;
}

/**
 * Tokens to keep IN CLEAR from a tool-DISCOVERY result — the API tool names + public
 * tech terms the NER would otherwise vault, breaking the model's tool discovery. `[]`
 * for any non-discovery result (data stays fully redacted). Never spares a vault-real
 * value (guard 3). Pinned by `toolRedactionPolicy.test.ts`.
 */
export function toolDiscoveryKeep(text: string, vaultValues: Iterable<string> = []): string[] {
  if (!isToolDiscoveryResult(text)) return [];
  const keep = new Set<string>();
  for (const m of text.matchAll(TOOL_NAME_ID)) keep.add(m[0]);
  for (const m of text.matchAll(TECH_TERM)) keep.add(m[0]);
  const real = new Set<string>();
  for (const v of vaultValues) real.add(v.toLowerCase());
  return [...keep].filter((k) => !real.has(k.toLowerCase()));
}

// ── run_python framework keep-list ──────────────────────────────────────────
// The bundled interpreter's public library / import identifiers (wheels.ts `WHEELS`
// + their import aliases + the stdlib tops a NER commonly mis-flags). These are PUBLIC
// OSS names, NEVER the user's PII — but a `run_python` traceback is full of them and the
// AI/remote detector mis-tags `scipy`/`numpy` as org/secret, `matplotlib`/`yfinance` as
// apikey. Left in clear via the send `keep` list so they're never vaulted.
const PY_PACKAGES = [
  "numpy", "np", "pandas", "pd", "scipy", "matplotlib", "pyplot", "plt", "mpl",
  "seaborn", "sns", "yfinance", "yf", "requests", "fpdf", "fpdf2", "openpyxl",
  "docx", "python-docx", "PIL", "pillow", "python",
  // stdlib tops that surface bare in tracebacks / imports
  "os", "sys", "json", "math", "re", "io", "datetime", "collections", "itertools",
  "functools", "typing", "pathlib", "warnings", "traceback", "importlib", "asyncio",
  // Library CACHE artifacts printed to stdout (yfinance/requests_cache announce their
  // cache location; a NER tags the path/token and the faked path then derails the model's
  // follow-up code) + the app's own name, which appears in userData paths libs echo.
  // The FULL userData path stays redacted — it carries the USERNAME.
  "yfinance_cache", "/tmp/yfinance_cache", BRAND.slug,
];

// Anything under a framework path root is a module identifier, not PII.
const PY_PATH_ROOT = /(?:site-packages|python-runtime|python3\.\d+)\/([A-Za-z0-9_./-]+)/g;
const PY_PKG_SET = new Set(PY_PACKAGES);

// A PUBLIC market symbol on a real exchange (`CW8.PA`, `SPY`, `ASML.AS`, `SAP.DE`). The
// exchange suffix (Euronext/Xetra/LSE/…) makes it an unambiguous ticker, never the user's
// PII — yet a NER tags a 3-5-letter ALL-CAPS code as an org/name (the reported `PNAS→VOXA`
// scramble that then derails the yfinance code). We keep BOTH the suffixed form and the
// bare code (the model writes `'PNAS': 'PNAS.PA'`, and stdout prints the bare ticker),
// but ONLY a bare code that ALSO appears suffixed in the SAME text — that co-occurrence is
// the ticker proof, so a lone ALL-CAPS acronym elsewhere is NOT spared. Guard 3 below still
// drops any that the vault knows is a real value.
const EXCHANGE_TICKER =
  /\b([A-Z][A-Z0-9]{0,5})\.(PA|AS|DE|L|MI|SW|BR|LS|VI|HE|ST|CO|OL|MC|AX|TO|HK|SS|SZ|F|IR|WA|MX)\b/g;
// Pure pandas/numpy/yfinance OUTPUT artifacts — structural repr tokens, never user data. A
// Series footer (`Name: <ticker>, dtype: float64`) is exactly what a NER hallucinated a
// PERSON from; sparing these labels breaks that span. Applied to run_python results ONLY.
const PANDAS_ARTIFACT = [
  "dtype", "float64", "float32", "int64", "int32", "object", "bool", "datetime64", "ns",
  "Name", "Ticker", "Freq", "NaN", "NaT", "Series", "DataFrame", "Index", "MultiIndex",
  "Close", "Open", "High", "Low", "Volume", "Adj",
];

/**
 * The library / module identifiers to keep IN CLEAR when redacting a `run_python` RESULT
 * (stdout / traceback). Combines the static bundled-package names with the module
 * SEGMENTS of a framework path found in the text (`…/site-packages/scipy/linalg/_basic.py`
 * → scipy, linalg, _basic) — so submodules (`linalg`/`_lib`/`core`/`testing`/…) the NER
 * hallucinates as secrets are spared WITHOUT a hand-maintained list.
 *
 * ⚠️ Deliberately a KEEP-LIST, not a category-clear: the sandbox runs on the user's REAL
 * data, so a `print()` can emit a genuine name/key/path — those MUST still be redacted
 * (rule 7, same reasoning as BROWSER_CLEAR). Only these known-public framework tokens are
 * cleared; everything else stays redacted. Pure — unit-tested.
 *
 * ⚠️⚠️ SECURITY — this harvests from ATTACKER-INFLUENCEABLE text. The model authors the
 * code, and `mcpAgent` runs it UN-REDACTED (`fromWire`), so a prompt-injected model that
 * emits `print("site-packages/<the fake it sees>")` gets the REAL value onto stdout — and
 * a naive harvest would then add that real value to `keep`, sending it to the model in
 * clear. That is a fake→real ORACLE over the whole vault, i.e. the product's core promise.
 * Three independent guards, each of which alone stops it:
 *   1. the path must be anchored on a KNOWN package — segments are harvested only from the
 *      first `PY_PACKAGES` hit onward, so a bare `site-packages/<x>` yields nothing;
 *   2. only a lowercase snake MODULE_ID is harvestable (a real name/org is Capitalised) —
 *      the same stricter shape `isPythonFrameworkArtifact` already demands below;
 *   3. a value the VAULT knows is real can never be spared (`vaultValues`) — which is
 *      exactly what an oracle needs, since the fake it echoes maps back to a vault entry.
 * Keep all three: 1+2 cover a value not yet vaulted, 3 covers a package-prefixed lowercase
 * one. A test pins each.
 */
export function pythonFrameworkKeep(text: string, vaultValues: Iterable<string> = []): string[] {
  const keep = new Set<string>([...PY_PACKAGES, ...PANDAS_ARTIFACT]);
  for (const m of text.matchAll(PY_PATH_ROOT)) {
    const segs = m[1].split("/").map((s) => s.replace(/\.py$/, ""));
    // Guard 1: harvest only from the first KNOWN package onward (`…/lib/python3.12/
    // site-packages/scipy/linalg/_basic.py` → scipy, linalg, _basic). No package in the
    // path ⇒ it isn't a framework path, whatever it looks like.
    const start = segs.findIndex((s) => PY_PKG_SET.has(s));
    if (start < 0) continue;
    // Guard 2: MODULE_ID (lowercase snake), NOT the looser identifier shape.
    for (const id of segs.slice(start)) if (MODULE_ID.test(id)) keep.add(id);
  }
  // Public exchange tickers: keep the suffixed symbol AND its bare code (the co-occurrence
  // in this same text is the ticker proof; a lone acronym elsewhere is never spared).
  for (const m of text.matchAll(EXCHANGE_TICKER)) {
    keep.add(m[0]); // e.g. "CW8.PA"
    keep.add(m[1]); // e.g. "CW8"
  }
  // Guard 3: never spare a value the vault holds as REAL.
  const real = new Set<string>();
  for (const v of vaultValues) real.add(v.toLowerCase());
  return [...keep].filter((k) => !real.has(k.toLowerCase()));
}

// A bundled-runtime / scratch / library-cache path anywhere in the value (any category).
// `yfinance_cache` (also dotted/dashed): a lib-announced cache dir is never user data.
const RUNTIME_PATH_SIG = /(?:site-packages|python-runtime|[/\\]python[/\\]runs[/\\]|yfinance[._-]?cache)/i;
// Unambiguous top-level OSS package names (NOT the 2-char aliases np/pd/yf nor generic
// stdlib os/io/re — those are too plausible as a real short value to DELETE from a vault).
const FRAMEWORK_PKG = new Set([
  "numpy", "pandas", "scipy", "matplotlib", "pyplot", "seaborn", "yfinance", "requests",
  "openpyxl", "docx", "python-docx", "fpdf", "fpdf2", "pillow", "sympy", "sklearn",
]);
// A pure-lowercase snake/underscore module identifier (linalg, _lib, array_api_compat…).
const MODULE_ID = /^_{0,2}[a-z][a-z0-9_]*$/;

/**
 * Is this VAULTED value a Python framework artifact that was wrongly redacted — used by
 * the one-shot cleanup of ALREADY-polluted conversation vaults (pythonFrameworkKeep only
 * prevents NEW pollution). DELIBERATELY STRICTER than the keep-list because removing a
 * vault entry is destructive: it must NEVER drop a real PII value. So it fires only on
 * high-confidence signals, and — for the ambiguous ones — only under a MIS-FLAG category:
 *   • a bundled-runtime / site-packages / runs PATH (any category);
 *   • an unambiguous top-level package name (`numpy`/`scipy`/… — real PII is never these);
 *   • a lowercase snake module id (`linalg`/`_lib`/…) ONLY when tagged secret/apikey — a
 *     REAL secret/key is high-entropy, never a dictionary-ish snake word.
 * Hard-PII categories (name/email/phone/address/iban/card/national_id) never match the
 * FRAMEWORK_PKG / MODULE_ID branches, so a real person/company is untouched.
 *
 * ⚠️ RESIDUAL (audit) — the `RUNTIME_PATH_SIG` branch is category-INDEPENDENT, so the
 * sentence above does NOT cover it: a REAL `path` value that happens to sit under a
 * venv (`/Users/jdupont/proj/.venv/lib/python3.12/site-packages/acme_internal/…`)
 * matches, its vault entry is dropped by `cleanVaultPollution`, and the next send ships
 * that path — username included — in clear. Not a wrong-restoration (the display text
 * holds the real value) but a fail-OPEN. Anchoring it to a category doesn't fix it (such
 * a value IS category `path`); the real fix is to spare a path carrying a user-identifying
 * segment. Left open deliberately rather than half-mitigated.
 */
export function isPythonFrameworkArtifact(value: string, category?: string): boolean {
  const v = value?.trim();
  if (!v) return false;
  if (RUNTIME_PATH_SIG.test(v)) return true;
  if (FRAMEWORK_PKG.has(v.toLowerCase())) return true;
  if ((category === "secret" || category === "apikey") && v.length >= 3 && v.length <= 32 && MODULE_ID.test(v)) {
    return true;
  }
  return false;
}

