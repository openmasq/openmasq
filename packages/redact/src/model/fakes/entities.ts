import { isNotoriousPlace } from "../../engine/geo/notorious";
import {
  FAKE_PLACES,
  FAKE_ORG,
  FAKE_EMAIL_DOMAINS,
  FAKE_LAST,
  firstNamePool,
  type FakePlace,
} from "./pools";
import { hashString, pick, rehash, fitLen, fakeToken, fakeDigits, luhnCheckDigit, mod97, seedFrom } from "./primitives";
import { ribKey } from "./checksummed/index";

/** A real city name, preferring one of the SAME length as the original (no padding).
 *  Excludes the real value itself AND world-famous places (`isNotoriousPlace`) so the
 *  fake is an OBSCURE city unlikely to be retyped — no vault collision later. Falls
 *  back progressively so a fake is always produced. */
export function fakeCity(value: string, h: number): string {
  const lv = value.toLowerCase();
  const notSelf = (p: FakePlace) => p.city.toLowerCase() !== lv;
  const sameLen = FAKE_PLACES.filter((p) => p.city.length === value.length && notSelf(p));
  const anyOther = FAKE_PLACES.filter(notSelf);
  const obscure = (arr: FakePlace[]) => arr.filter((p) => !isNotoriousPlace(p.city));
  const pool =
    obscure(sameLen).length ? obscure(sameLen)
    : sameLen.length ? sameLen
    : obscure(anyOther).length ? obscure(anyOther)
    : anyOther.length ? anyOther
    : FAKE_PLACES;
  return pool[h % pool.length].city;
}

/** The combinatorial org pool indexed by exact length, computed once. */
const ORG_BY_LEN: string[][] = (() => {
  const out: string[][] = [];
  for (const o of FAKE_ORG) (out[o.length] ??= []).push(o);
  return out;
})();
const ORG_MAX_LEN = ORG_BY_LEN.length - 1;

/**
 * A believable synthetic company name, preferring one CLOSE to the original's length so
 * it stays natural (no random-letter padding — "Verdanta", not "Acme SARLjqj").
 *
 * The length tolerance GROWS with `attempt`: the first tries stay exact-length, then
 * every second retry widens by ±1 — so the allocator's 60-attempt collision loop
 * actually explores the whole pool. The old exact-length-only filter left `h % pool`
 * cycling over 1-3 same-length names whatever the attempt, which is what cascaded a
 * multi-company document into the suffixed fallback (NAME/EMAIL abandoned strict
 * length-matching for the same reason: usable identity beats the size hint).
 * Candidates are ordered nearest-length-first, so a small `h` shift (the salt) moves
 * within the closest names before drifting. Deterministic per (value, salt, attempt).
 */
export function fakeOrg(target: number, h: number, attempt = 0): string {
  const tol = Math.min(Math.floor(attempt / 2), ORG_MAX_LEN);
  const cands: string[] = [];
  for (let d = 0; d <= tol; d++) {
    const below = target - d;
    const above = target + d;
    if (below >= 0 && below <= ORG_MAX_LEN && ORG_BY_LEN[below]) cands.push(...ORG_BY_LEN[below]);
    if (d > 0 && above >= 0 && above <= ORG_MAX_LEN && ORG_BY_LEN[above]) cands.push(...ORG_BY_LEN[above]);
  }
  if (cands.length) return cands[h % cands.length];
  // Nothing within tolerance (a very long/short name early in the loop) — fit the
  // closest pick; `h` varies with the attempt, so retries still explore.
  return fitLen(pick(FAKE_ORG, h), target, h);
}

/**
 * A fake postal code. A French 5-digit code becomes a REAL (different) 5-digit
 * code from the city pool — genuine and same length. Other shapes (UK/CA alnum,
 * odd lengths) fall back to a same-shape scramble so nothing leaks.
 */
export function fakePostal(value: string, h: number, attempt: number): string {
  // FR 5-digit → a REAL, different code from the FR pool (same length). The
  // region-aware / multi-country path is `fakeGeo`; this stays a bare fallback.
  if (/^\d{5}$/.test(value)) {
    const pool = FAKE_PLACES.filter((p) => p.cp !== value);
    return (pool.length ? pool : FAKE_PLACES)[h % (pool.length || FAKE_PLACES.length)].cp;
  }
  return /[A-Za-z]/.test(value) ? fakeToken(value, h) : fakeDigits(value, attempt);
}

/**
 * A realistic fake date: keeps the original's FORMAT (separators, field order,
 * digit widths, any month-name) but emits a VALID, different date — month 1-12,
 * day 1-28 (always valid), and a plausible year (DOB → 1940-2004, else 2005-2024).
 * Handles DD/MM/YYYY, YYYY-MM-DD, DD.MM.YY, "5 janvier 1990", a lone year, etc.
 * Falls back to a digit swap for shapes it can't parse (e.g. contiguous 8-digit).
 */
export function fakeDate(value: string, category: string, seed: number): string {
  const groups: { start: number; len: number; num: number }[] = [];
  for (const m of value.matchAll(/\d+/g)) {
    groups.push({ start: m.index!, len: m[0].length, num: Number(m[0]) });
  }
  const yearIdx = groups.findIndex((g) => g.len === 4);
  const dm = groups.map((g, i) => i).filter((i) => i !== yearIdx && groups[i].len <= 2);
  // Nothing date-like to work with (e.g. "12345678") → same-shape digit swap.
  if (yearIdx < 0 && dm.length < 2) return fakeDigits(value, seed);

  let h = (seed >>> 0) || 1;
  const rnd = (n: number) => ((h = (Math.imul(h, 1103515245) + 12345) >>> 0), h % n);

  const out = groups.map((g) => g.num);
  if (yearIdx >= 0) {
    const isDob = /dob|birth|naiss/i.test(category);
    // A generic date stays NEAR the original year (±2): the fixed 2005-2024 window sent
    // « RÉPARTITION DU 6 OCTOBRE 2025 » twenty years back, and the model reasoned about
    // a two-decades-old statement. Same year is fine — day/month still move, and the
    // caller's ≠-original guard retries when the whole date lands identical. DOB keeps
    // its wide window: a birth year is itself identifying.
    const realY = groups[yearIdx].len === 4 ? groups[yearIdx].num : 2000 + groups[yearIdx].num;
    const y = isDob ? 1940 + rnd(65) : realY - 2 + rnd(5);
    out[yearIdx] = groups[yearIdx].len === 4 ? y : ((y % 100) + 100) % 100;
  }
  // Cap the new value to the field's digit WIDTH so it never overflows/truncates
  // (a 1-digit field stays 1-9; a 2-digit day field 1-28; month 1-12).
  const dayMax = (i: number) => (groups[i].len === 1 ? 9 : 28);
  const monthMax = (i: number) => (groups[i].len === 1 ? 9 : 12);
  if (dm.length >= 2) {
    const big = dm.find((i) => groups[i].num > 12); // a value >12 must be the day
    let dayPos: number, monthPos: number;
    if (big != null) [dayPos, monthPos] = [big, dm.find((i) => i !== big)!];
    else if (yearIdx === 0) [monthPos, dayPos] = [dm[0], dm[1]]; // ISO Y-M-D
    else [dayPos, monthPos] = [dm[0], dm[1]]; // default D-M-Y
    out[monthPos] = 1 + rnd(monthMax(monthPos));
    out[dayPos] = 1 + rnd(dayMax(dayPos));
  } else if (dm.length === 1) {
    // A lone small number: a month in numeric "MM/YYYY", else a day.
    const monthOnly = yearIdx >= 0 && !/[A-Za-zÀ-ÿ]/.test(value);
    out[dm[0]] = 1 + rnd(monthOnly ? monthMax(dm[0]) : dayMax(dm[0]));
  }

  let result = "";
  let cursor = 0;
  groups.forEach((g, i) => {
    result += value.slice(cursor, g.start);
    result += String(out[i]).padStart(g.len, "0").slice(-g.len);
    cursor = g.start + g.len;
  });
  result += value.slice(cursor);
  return result;
}

/**
 * A believable, VALID fake IP. IPv4 → each dotted octet becomes a DIFFERENT in-range
 * value (0-255), keeping the octet's digit-width so the layout is preserved; IPv6 /
 * compact colon form → each hextet is re-randomised in hex. `fakeDigits` alone
 * swapped digits independently and produced OUT-OF-RANGE octets (`127` → `313`,
 * `973`) — an obviously broken "IP" that also leaked that the original was one.
 */
export function fakeIp(value: string, salt: number, convKey?: Uint8Array): string {
  const h = seedFrom(convKey, `ip:${salt}`, value, hashString(value) + salt);
  if (value.includes(":")) {
    let i = 0;
    return value.replace(/[0-9A-Fa-f]+/g, (grp) =>
      Array.from(grp, (_c, k) => "0123456789abcdef"[(h + i++ * 7 + k * 3 + 5) % 16]).join(""),
    );
  }
  let i = 0;
  return value.replace(/\d+/g, (oct) => {
    const width = oct.length;
    // The FIRST octet is bounded to plausible unicast space (1-223 — never 0, the
    // 224+ multicast range, or 255 broadcast) and dodges 127 (loopback): a fake
    // «255.x.x.x» read broken at a glance. Later octets keep the full 0-255 range.
    const first = i === 0;
    const min = width >= 3 ? 100 : width === 2 ? 10 : first ? 1 : 0;
    const max = width >= 3 ? (first ? 223 : 255) : width === 2 ? 99 : 9;
    const span = max - min + 1;
    let n = min + (rehash(h ^ Math.imul(i++ + 1, 0x85ebca6b)) % span);
    if (n === Number(oct)) n = min + ((n - min + 1) % span); // guarantee it differs
    if (first && n === 127) n = 128; // loopback
    return String(n);
  });
}

/**
 * A fake CARD number that VALIDATES: same-shape digit swap, then the last digit is
 * recomputed so Luhn passes. A fake that fails its own checksum is visible to any
 * tool/agent that validates — and invites a model to "correct" it, which breaks
 * reversibility. Layout/separators preserved; guaranteed to differ from the original.
 */
export function fakeCard(value: string, salt: number, convKey?: Uint8Array): string {
  const swapped = fakeDigits(value, salt, convKey);
  const digits = swapped.replace(/\D/g, "");
  if (digits.length < 12) return swapped; // not PAN-shaped — leave the plain swap
  // Keep the MII (first digit): the NETWORK is a derived attribute like a
  // phone's country code — a Visa "4…" faked to "8…" (an UNASSIGNED industry
  // id) reads broken to any brand-detecting form/tool. The rest of the BIN is
  // swapped: the issuing BANK is identity, the brand is not.
  let body = value.replace(/\D/g, "")[0] + digits.slice(1, -1);
  let full = body + luhnCheckDigit(body);
  if (full === value.replace(/\D/g, "")) {
    // The checksum landed us back on the real number — nudge one body digit.
    body = body.slice(0, 6) + String((Number(body[6]) + 1) % 10) + body.slice(7);
    full = body + luhnCheckDigit(body);
  }
  let i = 0;
  return swapped.replace(/\d/g, () => full[i++]);
}

/**
 * A fake IBAN that VALIDATES: country code kept verbatim, BBAN digits swapped (its
 * letters kept — they carry bank-format, not identity beyond what the swap hides),
 * then the two check digits are recomputed so mod-97 passes. Same rationale as
 * `fakeCard`; layout/spacing preserved.
 */
export function fakeIban(value: string, salt: number, convKey?: Uint8Array): string {
  const compact = value.replace(/\s/g, "");
  if (!/^[A-Za-z]{2}\d{2}[A-Za-z0-9]{8,}$/.test(compact)) return fakeDigits(value, salt);
  const cc = compact.slice(0, 2).toUpperCase();
  // Swap the BBAN's digits with fakeDigits' own mixing (digits-only seed).
  const bbanReal = compact.slice(4);
  const bbanD = bbanReal.replace(/\D/g, "");
  const h = seedFrom(convKey, `iban:${salt}`, bbanD, hashString(bbanD) + salt);
  let i = 0;
  let bban = bbanReal.replace(/\d/g, () => String(rehash(h ^ Math.imul(i++ + 1, 0x9e3779b1)) % 10));
  if (bban === bbanReal) bban = bbanReal.replace(/\d/, () => String(rehash(h ^ 0x5bf03635) % 10));
  // A FRENCH BBAN embeds its own RIB key (banque 5 + guichet 5 + compte 11 +
  // clé 2): recompute it so a French bank-side validator passes the WHOLE
  // coordinate, not only the ISO mod-97 — else the fake reads broken to any
  // RIB-checking tool and invites a "correction" that no longer reverses.
  if (cc === "FR" && /^\d{10}[0-9A-Z]{11}\d{2}$/i.test(bban)) {
    const k = ribKey(bban.slice(0, 5), bban.slice(5, 10), bban.slice(10, 21));
    if (k) bban = bban.slice(0, 21) + k;
  }
  const key = String(98 - mod97(`${bban}${cc}00`)).padStart(2, "0");
  const full = `${cc}${key}${bban}`;
  // Re-lay the fake under the ORIGINAL spacing — with a mid-value line WRAP flattened
  // to one space first, exactly like `fakeDigits`: a model normalises line breaks when
  // echoing, and a fake carrying the original's newline no longer reverse-maps.
  const laid = value.replace(/[ \t]*\r?\n[ \t]*/g, " ");
  let j = 0;
  return laid.replace(/[A-Za-z0-9]/g, () => full[j++] ?? "");
}

/**
 * A believable fake PHONE. `fakeDigits` alone swapped EVERY digit independently, which
 * destroyed the two things a reader (and the model) uses to recognise a phone number:
 * the COUNTRY CODE (`+33 6…` became `+29 9…` — +29 is not even an assigned code) and
 * the national CLASS prefix (`06…` became `58…`, no longer a French number at all).
 * A model that "corrects" an implausible number breaks reversibility.
 *
 * So: keep the `+CC` / `00CC` country code verbatim, keep the first TWO national digits
 * (`06` stays mobile, `01` stays Île-de-France — the class is not identifying), and
 * swap the SUBSCRIBER digits with `fakeDigits`' own mixing (digits-only seed, so the
 * same number under any spacing yields the same fake; separators/layout preserved).
 * Guaranteed to differ from the original. Shapes with no recognisable prefix fall back
 * to the plain digit swap — nothing leaks either way.
 */
export function fakePhone(value: string, salt: number, convKey?: Uint8Array): string {
  const digits = value.replace(/\D/g, "");
  // How many leading DIGITS to preserve: +CC / 00CC keeps the country code plus the
  // first national digit; a national 0X keeps the two-digit class. Else nothing.
  let keep = 0;
  const cc = value.match(/^\s*\+\s?(\d{1,3})/);
  if (cc) keep = cc[1].length + 1;
  else if (/^\s*00/.test(value)) keep = digits.startsWith("0033") ? 5 : 4;
  else if (/^\s*0\d/.test(value)) keep = 2;
  if (keep >= digits.length) return fakeDigits(value, salt); // degenerate — swap all
  // Mix the subscriber part exactly like fakeDigits (same seed recipe: digits-only +
  // salt), then re-lay the digits under the ORIGINAL layout, preserved verbatim.
  const h = seedFrom(convKey, `phone:${salt}`, digits, hashString(digits) + salt);
  let i = 0;
  let n = 0;
  let out = value.replace(/[ \t]*\r?\n[ \t]*/g, " ").replace(/\d/g, (d) => {
    n++;
    if (n <= keep) return d;
    return String(rehash(h ^ Math.imul(i++ + 1, 0x9e3779b1)) % 10);
  });
  if (out.replace(/\D/g, "") === digits) {
    // The mix landed on the original — bump one subscriber digit (never the prefix).
    let bumped = false;
    let k = 0;
    out = out.replace(/\d/g, (d) => {
      k++;
      if (k === keep + 1 && !bumped) {
        bumped = true;
        return String(rehash(h ^ 0x27d4eb2f) % 10);
      }
      return d;
    });
  }
  return out;
}

/**
 * A NATURAL fake email: `first.last@realdomain`, the first name matching the real
 * local-part's gender. Length-matching is deliberately ABANDONED (like NAME): padding
 * the local to the original's length appended random letters («julie.thomasxudqd@…»),
 * a gibberish surname that reads fake at a glance and that a model "corrects". The
 * `attempt` suffix (raw retry counter, never the salt — see the dispatch) keeps retries
 * distinct.
 */
export function fakeEmail(value: string, h: number, attempt: number): string {
  const domain = FAKE_EMAIL_DOMAINS[h % FAKE_EMAIL_DOMAINS.length];
  const realFirst = value.split("@")[0].split(/[._+-]/)[0]; // gender from the real local-part
  const first = pick(firstNamePool(realFirst), h).toLowerCase();
  const last = pick(FAKE_LAST, rehash(h)).toLowerCase();
  return `${first}.${last}${attempt || ""}${domain}`;
}
