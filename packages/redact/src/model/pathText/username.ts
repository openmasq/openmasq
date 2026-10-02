/**
 * The USERNAME slot of a home path (`/Users/x`, `/home/x`, `C:\Users\x`) and its fake: a
 * REALISTIC account name in the original's style — `jdoe` → initial + surname, `jane.doe` →
 * first.last, `Jane` → a first name — never a random string. Seeded like every fake
 * (per-conversation key, else the salt folded into `attempt`), on the LOWERCASED name.
 */
import { FAKE_LAST, firstNamePool } from "../fakes/pools";
import { pick, rehash } from "../fakes/primitives";
import { nameGender } from "../fakes/gender";
import { wordSeed } from "./words";

const HOME_HEAD = /^\/(?:users|home)\/$/i;
const DRIVE_HEAD = /^[A-Za-z]:[\\/]$/;

/**
 * Index (in a `splitPath` parts array) of the username segment, or -1. `head` is the
 * verbatim root `splitPath` kept: `/Users/` or `/home/` ⇒ the first segment; a drive root
 * followed by `Users` ⇒ the segment after it.
 */
export function usernameIndex(head: string, parts: string[]): number {
  if (HOME_HEAD.test(head)) return parts[0] ? 0 : -1;
  if (DRIVE_HEAD.test(head) && parts[0]?.toLowerCase() === "users" && parts[2]) return 2;
  return -1;
}

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase();

function caseLike(s: string, like: string): string {
  if (like === like.toUpperCase() && like !== like.toLowerCase()) return s.toUpperCase();
  return /^\p{Lu}/u.test(like) ? s[0].toUpperCase() + s.slice(1) : s;
}

/** A realistic account name standing in for `real`. Never equal to it (any casing), and
 *  never one `isFree` refuses (a fake another real username already wears in the vault). */
export function fakeUsername(
  real: string,
  attempt: number,
  convKey?: Uint8Array,
  isFree: (candidate: string) => boolean = () => true,
): string {
  // Trailing digits by a backward scan, not `/^(.*?)(\d*)$/`: that lazy split is
  // quadratic on a long digit run (CodeQL js/polynomial-redos).
  let cut = real.length;
  while (cut > 0 && real.charCodeAt(cut - 1) >= 48 && real.charCodeAt(cut - 1) <= 57) cut--;
  const body = real.slice(0, cut);
  const digits = real.slice(cut);
  for (let k = 0; k < 40; k++) {
    const seed = wordSeed("user", real, attempt + k * 131, convKey);
    const first = fold(pick(firstNamePool(body), seed)); // same gender when known
    const last = fold(pick(FAKE_LAST, rehash(seed)));
    const tail = digits.replace(/\d/g, (_d, i: number) => String((rehash(seed + i) >>> 3) % 10));
    let out: string;
    const joined = /^(\p{L}+)([._-])(\p{L}+)$/u.exec(body);
    if (joined) {
      // first.last / j.doe / jane-doe: keep the separator and each half's length class.
      const a = joined[1].length === 1 ? first[0] : first;
      out = caseLike(a, joined[1]) + joined[2] + caseLike(last, joined[3]);
    } else if (nameGender(body)) out = caseLike(first, body); // a bare first name
    else if (body.length >= 11) out = caseLike(first + last, body); // firstlast, glued
    else out = caseLike(first[0] + last, body); // the corporate jdoe
    out += tail;
    if (out.toLowerCase() !== real.toLowerCase() && isFree(out)) return out;
  }
  // Exhausted: a neutral account name, suffixed until free.
  const base = `user${(wordSeed("user", real, attempt, convKey) % 9000) + 1000}`;
  let out = base;
  for (let n = 2; !isFree(out); n++) out = `${base}-${n}`;
  return out;
}
