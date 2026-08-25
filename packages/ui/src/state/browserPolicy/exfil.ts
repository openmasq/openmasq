// ── Exfiltration heuristics (pure, unit-testable) ────────────────────────────
// The scans that decide when a tool call must be CONFIRMED because it carries the
// user's data somewhere unexpected: `analyzeNavExfil` for a navigation URL,
// `analyzeArgExfil` for any other tool's arguments.
//
// ⚠️ These are DAMAGE-LIMITERS, not an immunity claim, and root rule 11 put real weight
// on them: every connector now dispatches the REAL value, so there is no un-redaction
// gate behind these — they ARE the line. They are also the last thing standing between a
// prompt-injected model and a host it chose, so keep them keyed on the VALUE's shape and
// never on a tool/param NAME (naming must never confer capability).
//
// Kept beside `tools.ts` (classification + the domain allow-list) so a reviewer sees the
// whole agent-browser trust boundary as one family (root rule 10).

export interface NavExfilFlag {
  param: string;
  value: string;
  reason: string;
}
export interface NavExfilResult {
  host: string;
  suspicious: boolean;
  flags: NavExfilFlag[];
}

const B64ISH = /^[A-Za-z0-9+/=_-]{24,}$/;

/** Params that legitimately carry long FREE TEXT (search boxes): a long plaintext
 *  value here is EXPECTED — but ONLY on a real search engine (see below). Encoded
 *  blobs and values embedding conversation data are still flagged regardless. */
const SEARCH_PARAMS = new Set(["q", "query", "search", "s", "p", "wd", "text", "kw", "k"]);

/** Known search-engine hosts. The `SEARCH_PARAMS` length-exemption applies ONLY here
 *  (audit H-6): exfil to `attacker.example/?q=<secret>` is otherwise indistinguishable
 *  from a search box, so a long/opaque value going to a non-search host is NOT exempt. */
const SEARCH_ENGINE_HOSTS = /(^|\.)(google|duckduckgo|bing|yahoo|ecosia|brave|startpage|qwant|baidu|yandex)\.[a-z.]+$/i;

/** Bare length past which a NON-search value is opaque enough to mention. Kept high
 *  on purpose — a plain long value is the WEAKEST signal (a search phrase, a title,
 *  an address all exceed the old 40); only encoded/vault-embedding values matter. */
const BULKY_LEN = 120;

/** An absolute path (POSIX `/a/b`, Windows `C:\a\b`) → its segments; anything else stays
 *  ONE segment (compared whole). ⚠️ Keyed on the value's SHAPE, never the param NAME: a
 *  `key === "path"` test would let a hostile server exempt any arg by naming it `path`.
 *  `browserPolicy.test.ts` pins why the split exists and what it must still catch. */
function pathSegments(v: string): string[] {
  const isAbsPath = /^\/[^/]/.test(v) || /^[A-Za-z]:[\\/]/.test(v);
  return isAbsPath ? v.split(/[\\/]+/).filter(Boolean) : [v];
}

/**
 * A human-readable SLUG, not a blob: `brazil-markets-ibovespa-friday-july-17-2026`,
 * `en/news/2026/07/17/market-report`. Base64 spends `-`/`_`/`/` as DATA (~1 char in 32),
 * never as a separator, so a value that decomposes into WORDS is prose with dashes in it —
 * which is what most of the web's article URLs are.
 *
 * ⚠️ Requiring EVERY chunk to be a plain word or a plain number was too strict, and the
 * failing case is the norm, not the exception: news sites append an opaque article id
 * (`…-en-gironde-20250723_ZFHK4XMBRZDRPD3ZQZ2GQ7VXUE`). ONE alphanumeric chunk then sank
 * the whole slug, the path read as base64, and « Quelle actualité en France ? » opened a
 * confirmation about a Libération link. So the test is now POSITIVE — enough real words —
 * instead of demanding that nothing look like an id. A blob has no words to find: split
 * `/collect/eyJhbGciOiJIUzI1NiJ9…` and you get one, so it is still flagged.
 */
function looksLikeSlug(v: string): boolean {
  const chunks = v.split(/[-_/]+/).filter(Boolean);
  if (chunks.length < 3) return false;
  return chunks.filter((c) => /^[A-Za-z]{3,}$/.test(c)).length >= 3;
}

/**
 * A genuine data-SMUGGLING signal in a query value, independent of the param name:
 * an encoded blob (base64, or a doubly URL-encoded payload). Plain human text —
 * however long — is deliberately NOT one of these.
 *
 * ⚠️ `B64ISH` accepts `-`/`_` because base64URL uses them, which makes it match every
 * kebab-case article slug on the web. Two conditions keep those out, and neither costs
 * real detection: base64 over 24+ chars of arbitrary bytes contains BOTH cases with
 * probability ~1 (a miss needs 24 straight chars from one case's half of the alphabet),
 * and it does not decompose into words. A slug has neither property.
 *
 * This matters beyond tidiness: since rule 11 removed the un-redaction gate, this scan IS
 * the line. A warning that fires on ordinary news links is one the user learns to click
 * through, which costs more than the marginal blob it catches. What it must never miss —
 * a value carrying CONVERSATION data — is `analyzeNavExfil`'s vault check, which runs
 * first, is independent of this, and keys on the value, not its shape.
 */
function looksEncoded(v: string): string | null {
  const mixedCase = /[a-z]/.test(v) && /[A-Z]/.test(v);
  if (B64ISH.test(v) && /[0-9]/.test(v) && mixedCase && !looksLikeSlug(v))
    return "chaîne encodée (base64 ?)";
  if ((v.match(/%[0-9A-Fa-f]{2}/g) || []).length >= 6) return "blob URL-encodé";
  return null;
}

/**
 * Heuristic scan of a navigation URL for data-exfiltration patterns in its query
 * string / fragment: values that embed known conversation data (`vaultValues` =
 * real + fake vault entries), or encoded blobs — NOT merely-long plaintext, which
 * flags ordinary search queries. Advisory only — it surfaces a warning in the
 * write-confirmation dialog; the user still decides.
 *
 * Pass the URL as it will ACTUALLY be dispatched — i.e. FULLY un-redacted, which is what
 * every connector now sends (root rule 11). A real value in a real search box on a real
 * search engine is therefore the NORMAL case, not a finding: the user asked for that
 * search, and it cannot run on a fake. Anywhere else — another param, another host — the
 * same value in a URL is still the strongest exfil signal there is.
 */
export function analyzeNavExfil(
  url: string,
  vaultValues: string[] = [],
  /** Vault values that are PLACE names (category `location`). The web's geography is
   *  MADE of them (`lemonde.fr/France/`, wiki pages, city sections), so an exact-match
   *  PATH SEGMENT equal to one reads as site structure, not smuggling — flagging it
   *  teaches the user to click through the one card that must stay meaningful. The
   *  carve-out is PATH-ONLY and EXACT-only: a place as a QUERY value stays flagged
   *  (`evil.com/?q=Amiens` is payload — the exfil shape itself), a place embedded in a
   *  longer segment stays flagged, and the HOSTNAME is never exempted (a DNS-label
   *  smuggle is pre-TLS-visible and costs nothing to keep strict). Absent ⇒ nothing
   *  exempted (fail closed). */
  placeValues: string[] = [],
): NavExfilResult {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { host: "", suspicious: false, flags: [] };
  }
  const isSearchEngine = SEARCH_ENGINE_HOSTS.test(u.hostname);
  const placeSet = new Set(placeValues.map((v) => v.trim().toLowerCase()));
  const exactPlace = (v: string): boolean => placeSet.has(v.trim().toLowerCase());
  const flags: NavExfilFlag[] = [];
  const scan = (key: string, val: string) => {
    if (!val) return;
    // The ONE exemption: a vault value in a real search box, on a real search engine — that
    // IS the search the user asked for (rule 11). Narrow on purpose: `?redirect=<real>` or
    // `evil.com/?q=<real>` is exfil. ⚠️ It REMOVES the vault material from the scan, it does
    // not bless the value: the checks re-run on the RESIDUE, or `?q=<real> <blob>` rides out.
    const searchBox = isSearchEngine && SEARCH_PARAMS.has(key.toLowerCase());
    const residue = searchBox
      ? vaultValues.reduce((s: string, c: string) => (c ? s.split(c).join(" ") : s), val).trim()
      : val;
    // Conversation/vault data leaving in a URL is the strongest signal — flagged on ANY
    // host, ANY param, regardless of length/encoding (audit H-6). NO place carve-out
    // here: a query value is PAYLOAD (`evil.com/?q=Amiens` is the exfil shape the card
    // exists for) — only the PATH scan below treats an exact place as site structure.
    const vaultHit = vaultValues.find((s) => s.length >= 4 && residue.includes(s));
    if (vaultHit) {
      flags.push({ param: key, value: val, reason: "contient une donnée de la conversation" });
      return;
    }
    const enc = looksEncoded(residue);
    if (enc) {
      flags.push({ param: key, value: val, reason: enc });
      return;
    }
    // A merely very long, opaque value is the weakest signal — exempt search-box params
    // ONLY on a real search engine (a search phrase is legitimately long there). To ANY
    // other host, a long `q=` is as suspect as any other param.
    if (!searchBox && val.length >= BULKY_LEN) {
      flags.push({ param: key, value: val, reason: "valeur très longue" });
    }
  };
  let qTotal = 0;
  let qCount = 0;
  u.searchParams.forEach((val, key) => {
    qTotal += val.length;
    qCount += 1;
    scan(key, val);
  });
  // Split-exfil evasion (audit M2): the per-value length rule is dodged by chunking a
  // payload across many tiny params (`?a=x&b=y&c=z…`), each below BULKY_LEN with no vault
  // hit. To a NON-search host, flag the CUMULATIVE query volume / param count — a legit
  // non-search navigation carries few short params; a real search box is exempt (its long
  // query rides a single search param on a search-engine host, handled above).
  if (!isSearchEngine && (qTotal >= BULKY_LEN || qCount >= 12)) {
    flags.push({
      param: "requête",
      value: `${qCount} paramètre(s), ${qTotal} caractères`,
      reason: "cumul de données volumineux dans l'URL (exfiltration possible)",
    });
  }
  // The fragment can carry the same payload as the query, and a real value there is often
  // URL-encoded (`#Louis%20Simon`). Decode it before scanning so the vault check sees the
  // real value — the query is auto-decoded by URLSearchParams and the path is decoded above,
  // so the fragment was the one scan running on raw, undecoded text (audit L2). Fragments
  // aren't sent to the server on navigation, but they're visible to the destination's JS.
  if (u.hash && u.hash.length > 1) {
    const rawHash = u.hash.slice(1);
    let hash = rawHash;
    try {
      hash = decodeURIComponent(rawHash);
    } catch {
      /* malformed %-escape → scan raw */
    }
    scan("#", hash);
  }
  // Exfil can ride the PATH (`/collect/<base64-blob>`) or the HOSTNAME
  // (`<vault-value>.attacker.com` / a DNS-label smuggle), not only the query/fragment.
  // Scan the decoded path for a vault hit or an encoded blob (skip the bulky-length rule —
  // a legitimately long path shouldn't warn); flag the host only on a vault hit (a long
  // opaque host label is normal, and there's no search-param exemption to lean on).
  const decodedPath = (() => {
    const raw = u.pathname.replace(/^\/+/, "");
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  })();
  if (decodedPath) {
    // Per-SEGMENT place carve-out: `/France/elections` drops the exact-place segment
    // and scans the REST — an IBAN riding beside a place name still flags.
    const pathResidue = placeSet.size
      ? decodedPath.split("/").filter((seg) => !exactPlace(seg)).join("/")
      : decodedPath;
    const vaultHit = vaultValues.find((s) => s.length >= 4 && pathResidue.includes(s));
    if (vaultHit) {
      flags.push({ param: "chemin", value: decodedPath, reason: "contient une donnée de la conversation" });
    } else {
      const enc = looksEncoded(decodedPath);
      if (enc) flags.push({ param: "chemin", value: decodedPath, reason: enc });
    }
  }
  // Case-INSENSITIVE: `new URL()` lower-cases the hostname, so a literal compare could
  // never match a vault value carrying a capital — i.e. every name/company (the values
  // most worth smuggling) was undetectable in `<Real Name>.attacker.com`. Fail closed.
  const host = u.hostname.toLowerCase();
  const hostHit = vaultValues.find((s) => s.length >= 4 && host.includes(s.toLowerCase()));
  if (hostHit) {
    flags.push({ param: "hôte", value: u.hostname, reason: "contient une donnée de la conversation" });
  }
  return { host: u.hostname, suspicious: flags.length > 0, flags };
}

/**
 * Scan a tool call's (un-redacted) argument VALUES for conversation-data smuggling —
 * the H-4 exfil shape for NON-navigation tools. The pipeline un-redacts every string
 * arg (fake→REAL) before dispatch, so a prompt-injected model can call a read-classified
 * tool on any connector with real PII crammed into its args and the real data leaves the
 * machine with no confirmation. We distinguish LEGIT use from EXFIL by shape: a standalone
 * field whose value EQUALS a vault entry is the connector's purpose (send to the real
 * recipient, look up the real id) — NOT flagged; a vault value EMBEDDED inside a LARGER
 * string (concatenated with other data), or an encoded blob, is the model hiding
 * conversation secrets in an argument — flagged so the loop surfaces a confirm showing
 * the real values about to leave. Advisory (mirrors {@link analyzeNavExfil}); pure/tested.
 */
export function analyzeArgExfil(args: unknown, vaultValues: string[] = []): NavExfilResult {
  const flags: NavExfilFlag[] = [];
  const visit = (key: string, v: unknown): void => {
    if (typeof v === "string") {
      if (!v) return;
      const enc = looksEncoded(v);
      if (enc) {
        flags.push({ param: key || "arg", value: v, reason: enc });
        return;
      }
      // A PROPER substring match (v is longer than the vault value) = the value is
      // embedded/concatenated → smuggling. An exact-equal field value is legit — and a
      // PATH is a *list* of fields, so it is compared SEGMENT by segment (a folder really
      // IS named after the vaulted company, and the fs connector reported that root
      // itself). A value glued INSIDE a segment still flags.
      const parts = pathSegments(v);
      const hit = parts.some((seg) =>
        vaultValues.some((s) => s.length >= 4 && seg.length > s.length && seg.includes(s)),
      );
      if (hit) flags.push({ param: key || "arg", value: v, reason: "contient une donnée de la conversation" });
      return;
    }
    if (Array.isArray(v)) {
      v.forEach((x, i) => visit(`${key}[${i}]`, x));
      return;
    }
    if (v && typeof v === "object") {
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) visit(key ? `${key}.${k}` : k, x);
    }
  };
  visit("", args);
  return { host: "", suspicious: flags.length > 0, flags };
}
