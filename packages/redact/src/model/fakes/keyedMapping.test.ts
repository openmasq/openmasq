// What a per-conversation KEY buys that the per-conversation SALT never did.
//
// `salt.test.ts` pins that the salt shifts the mapping and is deterministic. An additive
// shift over a PUBLIC hash satisfies both — and is still recoverable: the shift is the
// same for every value in the conversation, so one known (value, fake) pair yields it,
// and with it every other value.
//
// These cases run that as an attack. The legacy path is the NEGATIVE CONTROL: the search
// finds the shift there and predicts a value it never saw. If someone later folds the
// keyed seed back into an additive one, the control keeps passing and the keyed cases
// start failing — which is the signal we want.
//
// ⚠️ The attack is stated on a HIGH-ENTROPY value (a 14-digit id), not on a name. Name
// fakes are drawn from a 16-entry pool, so two different shifts land on the same fake by
// chance constantly: a "match" there measures pool collisions, not key recovery. On a
// digit value the output space is 10¹⁴, so a match means the shift was genuinely found.
import { describe, it, expect } from "vitest";
import { fakeFor } from "./dispatch";
import { keyFromHex } from "./prf";

const KEY_A = keyFromHex("a1".repeat(32))!;
const KEY_B = keyFromHex("b2".repeat(32))!;

/** The victim's values. The attacker knows the first pair and wants the second. */
const KNOWN = "863 471 587 00015";
const SECRET = "552 100 554 00021";
const CAT = "COMPANY_ID";

/**
 * The real shift space is 2³¹; a test cannot walk it, so the fixture uses a small shift
 * and a small window. That does not weaken the claim — it makes the legacy path EASIER to
 * break, which is the point of a control: an attack that fails even here fails at scale.
 */
const SHIFT = 4_242;
const WINDOW = 20_000;

const fake = (v: string, salt = 0, key?: Uint8Array, attempt = 0) =>
  fakeFor(CAT, v, attempt, undefined, salt, undefined, key);

function recoverShift(known: string, knownFake: string): number | null {
  for (let s = 0; s < WINDOW; s++) if (fake(known, s) === knownFake) return s;
  return null;
}

describe("the legacy salted mapping is recoverable — the reason a key exists", () => {
  it("one known pair yields the shift, and the shift yields a value never seen", () => {
    const knownFake = fake(KNOWN, SHIFT);
    const secretFake = fake(SECRET, SHIFT);

    const found = recoverShift(KNOWN, knownFake);
    expect(found).toBe(SHIFT); // on 10¹⁴ outputs, a match is the shift, not a collision
    expect(fake(SECRET, found!)).toBe(secretFake);
  });
});

describe("the keyed mapping is not", () => {
  it("no shift in the searched space reproduces a keyed fake", () => {
    expect(recoverShift(KNOWN, fake(KNOWN, 0, KEY_A))).toBeNull();
  });

  it("holding one pair does not reproduce another value's fake", () => {
    const secretFake = fake(SECRET, 0, KEY_A);
    // Everything the attacker can compute WITHOUT the key must miss.
    for (let s = 0; s < WINDOW; s++) expect(fake(SECRET, s)).not.toBe(secretFake);
  });

  it("is deterministic per (key, value) — identity atomicity still holds", () => {
    expect(fake(KNOWN, 0, KEY_A)).toBe(fake(KNOWN, 0, KEY_A));
  });

  it("decorrelates conversations: another key, another fake", () => {
    expect(fake(KNOWN, 0, KEY_A)).not.toBe(fake(KNOWN, 0, KEY_B));
  });

  it("still varies with the retry attempt, so collisions can be resolved", () => {
    expect(fake(KNOWN, 0, KEY_A, 0)).not.toBe(fake(KNOWN, 0, KEY_A, 1));
  });
});

describe("the keyed path keeps the generators' contract", () => {
  it("preserves shape and still hides its input", () => {
    const f = fake(KNOWN, 0, KEY_A);
    expect(f).toMatch(/^\d{3} \d{3} \d{3} \d{5}$/);
    const r = KNOWN.replace(/\D/g, "").split("").map(Number);
    const g = f.replace(/\D/g, "").split("").map(Number);
    for (let a = 0; a < 10; a++)
      for (let c = 0; c < 10; c++)
        expect(r.every((n, i) => (n + a * i + c) % 10 === g[i])).toBe(false);
  });

  it("one number written two ways keeps ONE fake under a key", () => {
    const a = fake("863 471 587 00015", 0, KEY_A);
    const b = fake("863471587 000 15", 0, KEY_A);
    expect(a.replace(/\D/g, "")).toBe(b.replace(/\D/g, ""));
  });

  it("a keyed name fake is still a believable name", () => {
    const n = fakeFor("NAME", "Jean Dupont", 0, undefined, 0, undefined, KEY_A);
    expect(n).toMatch(/^\p{Lu}\p{L}+ \p{Lu}[\p{L}'-]+$/u);
    expect(n).not.toBe("Jean Dupont");
  });
});
