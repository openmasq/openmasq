import { hashString, rehash, seedFrom } from "./primitives";

/**
 * A fake IP that hides WHICH host and keeps WHAT KIND of host — the two things a model
 * reasons on are its class and its neighbourhood, and a substitute that changes either makes
 * the model confidently wrong (a LAN address faked as a public one was answered "public").
 *
 * CLASS-preserving: loopback stays 127/8, a private address stays in its own RFC 1918 block
 * (10/8, 172.16/12, 192.168/16), link-local stays 169.254/16, CGNAT stays 100.64/10, and a
 * public address is drawn from public space only. The leading octets that NAME the class are
 * kept verbatim; they identify nobody.
 *
 * PREFIX-preserving, in the sense of Crypto-PAn (Xu et al. 2001) at octet granularity: octet
 * i of the fake is a keyed function of the real octets 0..i, so two addresses sharing a /24
 * share a fake /24 and a subnet sweep, a CIDR or a "same network?" question keeps its answer.
 * With a conversation key the function is an HMAC; without one it is the legacy public hash,
 * still prefix-consistent. `ipPrefixPairs` gives the vault the /24 so a prefix the model
 * writes on its own reverses too.
 */
export function fakeIp(value: string, salt: number, convKey?: Uint8Array): string {
  if (value.includes(":")) return fakeIp6(value, salt, convKey);
  const octets = value.split(".").map(Number);
  if (octets.length !== 4 || octets.some((o) => Number.isNaN(o) || o < 0 || o > 255)) {
    return fakeIp4Loose(value, salt, convKey);
  }
  const cls = v4Class(octets);
  const out = octets.slice(0, cls.keep);
  for (let i = cls.keep; i < 4; i++) {
    const prefix = octets.slice(0, i + 1).join(".");
    const h = seedFrom(convKey, `ip4:${salt}`, prefix, hashString(prefix) + salt);
    out.push(drawOctet(h, i, cls, out));
  }
  if (out.join(".") === value) out[3] = (out[3] + 1) % 256; // never the real address
  return out.join(".");
}

/** Which leading octets name the class, and the range the next octet must stay in. */
interface V4Class {
  keep: number;
  /** For the first faked octet, when the class constrains it (172.16-31, 100.64-127). */
  next?: [number, number];
  public?: boolean;
}

function v4Class(o: number[]): V4Class {
  if (o[0] === 127) return { keep: 1 };
  if (o[0] === 10) return { keep: 1 };
  if (o[0] === 172 && o[1] >= 16 && o[1] <= 31) return { keep: 1, next: [16, 31] };
  if (o[0] === 192 && o[1] === 168) return { keep: 2 };
  if (o[0] === 169 && o[1] === 254) return { keep: 2 };
  if (o[0] === 100 && o[1] >= 64 && o[1] <= 127) return { keep: 1, next: [64, 127] };
  return { keep: 0, public: true };
}

/** Is `[a, b]` the start of a reserved block a PUBLIC fake must not land in. */
function reservedStart(a: number, b: number): boolean {
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0)) ||
    (a === 169 && b === 254) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && (b === 18 || b === 19))
  );
}

function drawOctet(h: number, i: number, cls: V4Class, sofar: number[]): number {
  const range: [number, number] =
    i === cls.keep && cls.next ? cls.next : i === 0 ? [1, 223] : [0, 255];
  const span = range[1] - range[0] + 1;
  let n = range[0] + (rehash(h) % span);
  if (cls.public) {
    // Walk forward until the pair (first, second) is outside every reserved block — bounded,
    // the reserved space is a small part of it. Later octets are free.
    for (
      let t = 0;
      t < 64 && i <= 1 && reservedStart(i === 0 ? n : sofar[0], i === 0 ? 0 : n);
      t++
    ) {
      n = range[0] + ((n - range[0] + 1) % span);
    }
  }
  return n;
}

/** A dotted string that failed the strict parse (a leading zero, an odd width): the legacy
 *  same-width swap, still prefix-consistent. */
function fakeIp4Loose(value: string, salt: number, convKey?: Uint8Array): string {
  let i = 0;
  const seen: string[] = [];
  return value.replace(/\d+/g, (oct) => {
    seen.push(oct);
    const h = seedFrom(convKey, `ip4:${salt}`, seen.join("."), hashString(seen.join(".")) + salt);
    const width = oct.length;
    const min = width >= 3 ? 100 : width === 2 ? 10 : i === 0 ? 1 : 0;
    const max = width >= 3 ? (i === 0 ? 223 : 255) : width === 2 ? 99 : 9;
    let n = min + (rehash(h ^ Math.imul(i++ + 1, 0x85ebca6b)) % (max - min + 1));
    if (n === Number(oct)) n = min + ((n - min + 1) % (max - min + 1));
    return String(n);
  });
}

/** IPv6: the scope prefix is kept (fe80 link-local, fc/fd unique-local, ::1 loopback stays
 *  ::-shaped), every other hextet is a keyed function of the hextets before it. */
function fakeIp6(value: string, salt: number, convKey?: Uint8Array): string {
  const first = /^([0-9a-f]{1,4})/i.exec(value)?.[1]?.toLowerCase() ?? "";
  const keepFirst =
    first === "fe80" || /^f[cd]/.test(first) || (first === "2001" && /^2001:0?db8/i.test(value));
  const seen: string[] = [];
  let i = 0;
  return value.replace(/[0-9A-Fa-f]{1,4}/g, (grp) => {
    seen.push(grp.toLowerCase());
    if (i++ === 0 && keepFirst) return grp;
    if (keepFirst && i === 2 && first === "2001") return grp; // 2001:db8 documentation prefix
    const h = seedFrom(convKey, `ip6:${salt}`, seen.join(":"), hashString(seen.join(":")) + salt);
    let out = "";
    for (let k = 0; k < grp.length; k++)
      out += "0123456789abcdef"[rehash(h ^ Math.imul(k + 1, 0x9e3779b1)) % 16];
    if (out !== grp.toLowerCase()) return out;
    return `${out.slice(0, -1)}${((parseInt(out.slice(-1), 16) + 1) % 16).toString(16)}`; // never verbatim
  });
}

/**
 * The vault pairs beside a faked IPv4: `[fake /24, real /24]`, so a subnet the model writes
 * from what it saw ("104.215.3.0/24", "104.215.3.") reverses to the real network, and the
 * real prefix written alone in later text masks consistently. Only the /24: a two-octet
 * prefix ("10.0") is also a version number in ordinary prose.
 */
export function ipPrefixPairs(real: string, fake: string): [string, string][] {
  const r = real.split(".");
  const f = fake.split(".");
  if (r.length !== 4 || f.length !== 4) return [];
  const rp = r.slice(0, 3).join(".");
  const fp = f.slice(0, 3).join(".");
  return rp === fp ? [] : [[fp, rp]];
}
