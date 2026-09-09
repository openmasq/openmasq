// Network-address validators: telling a genuine IP from a colon-separated look-alike, and a
// person's host from a universal special-use constant. Kept beside each other (rule 10) — one
// says WHAT is an IP, the other whether that IP is anybody's data.

/**
 * True when an `ip`-rule match is a genuine IP. IPv4 (no colon) is already octet-
 * validated by the rule's regex, so it always passes. The rule's "compact IPv6"
 * alternative, however, is loose enough to also grab colon-separated DECIMAL runs
 * that are really CLOCK TIMES (`21:21:09`, `10:50:28`) or short ids — a real IPv6 has
 * 8 hextets (or a `::` compression) and virtually always contains a hex letter or a
 * >2-char hextet. So a SHORT, all-simple-decimal colon match is rejected (it was
 * flooding the audit as "Adresses IP" false positives on timestamp columns).
 */
/**
 * ⚠️ ACCEPTED RESIDUAL (audit R3): a 4-component VERSION string and a private IPv4 are the
 * same string — `10.2.4.1` is both "on passe en 10.2.4.1" and a valid RFC1918 address. No
 * signal inside the value separates them, and the only discriminator is context ("version",
 * "v"), which is locale-dependent prose. A context guard would therefore trade a certain
 * cost (a real internal IP, mentioned right after the word « version », left in CLEAR) for
 * a cosmetic gain. The engine's asymmetry decides it: over-redacting a version string is
 * noise, under-redacting an address is a privacy failure. So this is deliberately NOT
 * guarded — do not "fix" it without a discriminator that lives in the value.
 */
export function isRealIp(match: string): boolean {
  if (!match.includes(":")) return true; // IPv4 — octets already validated by the regex
  const groups = match.split(":");
  const structured = groups.some((g) => /[A-Fa-f]/.test(g) || g.length > 2);
  return groups.length >= 8 || structured;
}

/**
 * A SPECIAL-USE IP that identifies no particular host on anybody's network — a universal
 * constant, never a person's data. Masking one protects nobody and actively corrupts the
 * technical content a coding agent reasons on: a faked `127.0.0.1`, a mangled cloud-metadata
 * `169.254.169.254`, an `0.0.0.0` turned into a public address. These are dropped from `ip`
 * detection.
 *
 * A PRIVATE address is NOT reserved and stays masked: `10/8`, `172.16/12`, `192.168/16` and
 * IPv6 ULA `fd00::/8` name a real host on an internal network, whose topology can be
 * sensitive — and the faker keeps each in its own class. The line is « identifies no host at
 * all » (here) vs « identifies a host on a private network » (still PII). A user who wants no
 * IP at all runs `--disable ip`.
 *
 * Ranges (RFC 5735 / 6890): IPv4 this-host 0/8, loopback 127/8, link-local 169.254/16,
 * documentation 192.0.2/24 · 198.51.100/24 · 203.0.113/24, broadcast 255.255.255.255. IPv6
 * unspecified `::`, loopback `::1`, link-local fe80::/10, documentation 2001:db8::/32.
 */
export function isReservedIp(match: string): boolean {
  const ip = match.trim().toLowerCase();
  if (ip.includes(":")) {
    if (ip === "::" || ip === "::1") return true;
    if (/^fe[89ab][0-9a-f]:/.test(ip)) return true; // fe80::/10 link-local
    if (ip === "2001:db8::" || ip.startsWith("2001:db8:")) return true; // documentation
    return false;
  }
  const o = ip.split(".").map(Number);
  if (o.length !== 4 || o.some((n) => Number.isNaN(n))) return false;
  const [a, b, c] = o;
  if (a === 0 || a === 127) return true; // this-host (incl. 0.0.0.0), loopback
  if (a === 169 && b === 254) return true; // link-local, incl. 169.254.169.254 (cloud metadata)
  if (a === 192 && b === 0 && c === 2) return true; // TEST-NET-1 (documentation)
  if (a === 198 && b === 51 && c === 100) return true; // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true; // TEST-NET-3
  if (o.every((n) => n === 255)) return true; // broadcast
  return false;
}
