import { isIP } from "node:net";

/**
 * IP-literal classification — the "is this address non-public" half of the SSRF floor,
 * split out of `net.ts` so the guard's *decision* logic (`assertPublicUrl`, `safeFetch`)
 * reads without ~90 lines of bit arithmetic in front of it. Pure, no I/O, no DNS.
 *
 * `net.ts` re-exports `isPrivateIp`, so every existing importer of `./net` is unchanged.
 */

/** Parse a dotted IPv4 into its four octets, or null if malformed. */
function ipv4Octets(ip: string): [number, number, number, number] | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return nums as [number, number, number, number];
}

/** True for loopback / private / link-local / CGNAT / reserved IPv4 space. */
function isPrivateIpv4(ip: string): boolean {
  const o = ipv4Octets(ip);
  if (!o) return false;
  const [a, b] = o;
  return (
    a === 0 || // 0.0.0.0/8 "this host"
    a === 10 || // 10/8 private
    a === 127 || // 127/8 loopback
    (a === 100 && b >= 64 && b <= 127) || // 100.64/10 CGNAT
    (a === 169 && b === 254) || // 169.254/16 link-local (incl. 169.254.169.254 metadata)
    (a === 172 && b >= 16 && b <= 31) || // 172.16/12 private
    (a === 192 && b === 0) || // 192.0.0/24 IETF protocol assignments
    (a === 192 && b === 88 && o[2] === 99) || // 192.88.99/24 6to4 relay anycast (deprecated)
    (a === 192 && b === 168) || // 192.168/16 private
    (a === 198 && (b === 18 || b === 19)) || // 198.18/15 benchmarking
    a >= 224 // 224/4 multicast + 240/4 reserved
  );
}

/**
 * Expand a (validated) IPv6 literal to its 8 hextets as numbers, handling `::`
 * compression AND a trailing dotted-IPv4 group — in ANY grouping, not just a leading
 * `::`. Returns null if it can't parse to 8 groups. Audit NET-F1: the previous regex
 * only recognised `::`-PREFIXED IPv4-mapped forms, so a fully-expanded / alternately-
 * grouped mapped literal like `0:0:0:0:0:ffff:169.254.169.254` (valid IPv6, `isIP`=6,
 * routes to the embedded v4 on a dual-stack host) slipped through as "public". Parsing
 * to hextets closes every grouping of the mapped/compat form uniformly.
 */
function expandIpv6(ip: string): number[] | null {
  let s = ip.toLowerCase().replace(/^\[|\]$/g, "").split("%")[0]; // drop brackets + zone id
  // Convert a trailing dotted-IPv4 group to two hex groups (::ffff:1.2.3.4 → ::ffff:0102:0304).
  const m = s.match(/^(.*:)((?:\d{1,3}\.){3}\d{1,3})$/);
  if (m) {
    const o = m[2].split(".").map((x) => parseInt(x, 10));
    if (o.some((n) => n > 255 || Number.isNaN(n))) return null;
    s = m[1] + (((o[0] << 8) | o[1]) >>> 0).toString(16) + ":" + (((o[2] << 8) | o[3]) >>> 0).toString(16);
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const parse = (part: string): number[] =>
    part === "" ? [] : part.split(":").map((h) => parseInt(h, 16));
  const head = parse(halves[0]);
  const tail = halves.length === 2 ? parse(halves[1]) : [];
  if (head.some(Number.isNaN) || tail.some(Number.isNaN)) return null;
  if (halves.length === 1) return head.length === 8 ? head : null;
  const fill = 8 - head.length - tail.length;
  if (fill < 0) return null;
  return [...head, ...Array(fill).fill(0), ...tail];
}

/** True for loopback / unspecified / ULA / link-local / site-local / multicast IPv6,
 *  and any IPv4-mapped/compat address whose embedded v4 is private (any grouping). */
function isPrivateIpv6(ip: string): boolean {
  const h = expandIpv6(ip);
  if (!h || h.length !== 8) return true; // fail CLOSED: an IPv6 we can't parse is refused
  // Loopback (::1) / unspecified (::).
  if (h[0] === 0 && h[1] === 0 && h[2] === 0 && h[3] === 0 && h[4] === 0 && h[5] === 0 && h[6] === 0) {
    return h[7] === 0 || h[7] === 1 || isPrivateIpv4(`0.0.${h[7] >> 8}.${h[7] & 0xff}`);
  }
  // IPv4-mapped (::ffff:a.b.c.d → h[5]=0xffff) or IPv4-compat (::a.b.c.d → h[5]=0), high bits 0.
  if (h[0] === 0 && h[1] === 0 && h[2] === 0 && h[3] === 0 && h[4] === 0 && (h[5] === 0xffff || h[5] === 0)) {
    return isPrivateIpv4(`${h[6] >> 8}.${h[6] & 0xff}.${h[7] >> 8}.${h[7] & 0xff}`);
  }
  const head = h[0];
  if ((head & 0xfe00) === 0xfc00) return true; // fc00::/7 ULA
  if ((head & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((head & 0xffc0) === 0xfec0) return true; // fec0::/10 site-local (deprecated)
  if ((head & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  return false;
}

/** True for any non-public IP literal (either family). */
export function isPrivateIp(ip: string): boolean {
  const fam = isIP(ip);
  if (fam === 4) return isPrivateIpv4(ip);
  if (fam === 6) return isPrivateIpv6(ip);
  return false;
}
