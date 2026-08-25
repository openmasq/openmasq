import { describe, expect, it } from "vitest";
import { fakeFor, FAKE_PLACES, FAKE_ORG } from "./fakes";
import { buildFakeEmail, emailNameAliases } from "./identity";
import { isNotoriousPlace } from "../engine/geo/notorious";

const REAL_CITIES = new Set(FAKE_PLACES.map((p) => p.city));
const REAL_CPS = new Set(FAKE_PLACES.map((p) => p.cp));

// Each fake must keep (ideally exactly) the original's length, so layout and
// token counts are preserved and the fake's size gives nothing away.
// Kinds whose fake keeps the EXACT length (layout/token-count preservation). NAME and
// EMAIL are deliberately ABSENT: they abandon length-matching (a usable identity beats
// the size hint — padding minted gibberish surnames like «Garciaopihar»).
const CASES: Array<[string, string]> = [
  ["ORG", "International Business Machines Corporation"],
  ["ORG", "X"],
  ["PHONE", "+33 6 12 34 56 78"],
  ["IP", "192.168.100.254"],
  ["API_KEY", "sk-live-DEADBEEF1234567890ABCD"],
];

describe("fakeFor length preservation", () => {
  for (const [category, value] of CASES) {
    it(`${category} (${value.length} chars) keeps exact length`, () => {
      const fake = fakeFor(category, value, 0);
      expect(fake).toHaveLength(value.length);
      expect(fake).not.toBe(value);
    });
  }

  it("is deterministic for the same input + attempt", () => {
    expect(fakeFor("NAME", "Marie Curie", 3)).toBe(fakeFor("NAME", "Marie Curie", 3));
  });

  it("varies across attempts (for uniqueness allocation)", () => {
    const a = fakeFor("NAME", "Marie Curie", 0);
    const b = fakeFor("NAME", "Marie Curie", 1);
    expect(a).not.toBe(b);
  });

  it("a NAME fake is NATURAL: pool words only, word count mirrored, no padding", () => {
    // Two-word real → two clean pool words; one-word real → ONE word (a two-word fake
    // for a one-word value split identities through the recase separator replication).
    expect(fakeFor("NAME", "Jean-Philippe Bertholet-Montagne", 0)).toMatch(/^\p{Lu}[\p{L}é]+ \p{Lu}[\p{L}é]+$/u);
    expect(fakeFor("NAME", "Al", 0)).toMatch(/^\p{Lu}[\p{L}é]+$/u);
    expect(fakeFor("FIRSTNAME", "Maximilian", 0)).toMatch(/^\p{Lu}[\p{L}é]+$/u);
    expect(fakeFor("LASTNAME", "Wu", 0)).toMatch(/^\p{Lu}[\p{L}é]+$/u);
  });

  it("produces a natural, structurally valid email (no length padding, no salt digits)", () => {
    for (const src of ["contact.person@company.example.com", "a@b.co"]) {
      const fake = fakeFor("EMAIL", src, 0);
      expect(fake).not.toBe(src);
      // first.last on a REAL pool domain — never letter-padding to match the length.
      expect(fake).toMatch(/^[a-zé]+\.[a-zé]+@[a-z.]+$/);
    }
  });

  it("uses a REAL (different) city name", () => {
    const fake = fakeFor("CITY", "Paris", 0);
    expect(REAL_CITIES.has(fake)).toBe(true);
    expect(fake).not.toBe("Paris");
  });

  it("prefers a real city of the same length when one exists", () => {
    // "Lille"/"Reims"/"Dijon"… are 5-char real cities, so a 5-char original stays 5.
    const fake = fakeFor("CITY", "Lyon", 0); // 4 chars: Nice/Metz/Caen/Pau? → 4-char real city
    expect(REAL_CITIES.has(fake)).toBe(true);
    expect(fake).toHaveLength(4);
  });

  it("avoids world-famous places (obscure fake → no retype collision) (C)", () => {
    // A fake city must NOT be a place the user is likely to type themselves, else it
    // collides with a legit occurrence later in the conversation (the "france" trap).
    // Sweep many hashes across several real inputs — none should land on a notorious one.
    for (const src of ["Amiens", "Melun", "Arras", "Nancy", "Tours"]) {
      for (let h = 0; h < 60; h++) {
        const fake = fakeFor("CITY", src, h);
        expect(REAL_CITIES.has(fake)).toBe(true);
        expect(isNotoriousPlace(fake)).toBe(false);
        expect(fake.toLowerCase()).not.toBe(src.toLowerCase());
      }
    }
  });

  it("uses a REAL (different) French postal code, same length", () => {
    const fake = fakeFor("POSTAL_CODE", "75008", 0);
    expect(REAL_CPS.has(fake)).toBe(true);
    expect(fake).toHaveLength(5);
    expect(fake).not.toBe("75008");
  });

  it("addresses embed a real city + its real postal code", () => {
    const fake = fakeFor("ADDRESS", "12 rue de la République, 69001 Lyon", 0);
    const place = FAKE_PLACES.find((p) => fake.endsWith(`${p.cp} ${p.city}`));
    expect(place).toBeDefined(); // a consistent real (cp, city) pair
  });

  it("uses a NATURAL same-length org name (no random-letter padding)", () => {
    // "Ouest-France" is 12 chars; the pool has 12-char names ("Norwood Labs",
    // "Fenwick & Co"), so the fake is a believable pool member, not "Acme SARLjqj".
    const fake = fakeFor("ORG", "Ouest-France", 0);
    expect(FAKE_ORG).toContain(fake);
    expect(fake).toHaveLength(12);
    expect(fake).not.toBe("Ouest-France");
  });

  it("never uses a famous fictional (or real) brand as an org fake", () => {
    // A browser/search AGENT RECOGNISES a famous name ("Tyrell Corp", "Cyberdyne",
    // "Stark Industries") and researches the FICTION instead of the user's real
    // company. Org fakes must be invented + obscure so the model treats them as a
    // real-but-unknown company (and the query still de-redacts to the real name).
    const FAMOUS = [
      "acme", "hooli", "globex", "initech", "soylent", "umbrella", "cyberdyne",
      "aperture", "tyrell", "oscorp", "wonka", "gringotts", "nakatomi", "stark",
      "wayne", "weyland", "yutani", "massive dynamic", "pied piper", "black mesa",
      "dunder mifflin", "vandelay", "prestige worldwide", "los pollos",
    ];
    for (const org of FAKE_ORG) {
      const low = org.toLowerCase();
      for (const famous of FAMOUS) expect(low).not.toContain(famous);
    }
  });
});

describe("emailNameAliases (reversible name deduced from a faked email)", () => {
  it("aligns the fake first/last name to the real one, both cases", () => {
    // A fake email whose local-part is a first.last name → the model can greet by
    // that name; the alias makes it reverse to the REAL name.
    const aliases = emailNameAliases("julien.sabourdin@gmail.com", "nathan.brivet@gmail.com");
    expect(aliases).toEqual(
      expect.arrayContaining([
        ["Nathan", "Julien"],
        ["nathan", "julien"],
        ["Brivet", "Sabourdin"],
        ["brivet", "sabourdin"],
      ]),
    );
  });

  it("aligns positionally even when the real email is first-name only", () => {
    const aliases = emailNameAliases("julien@gmail.com", "nathan.brivet@gmail.com");
    expect(aliases).toContainEqual(["Nathan", "Julien"]);
  });

  it("yields NOTHING for a generic mailbox (no real person to restore to)", () => {
    expect(emailNameAliases("contact@acme.com", "nathan.brivet@acme.com")).toEqual([]);
    expect(emailNameAliases("no-reply@acme.com", "nathan.brivet@acme.com")).toEqual([]);
  });

  it("skips too-short / non-alphabetic tokens", () => {
    // real local "j.sabourdin": "t" is 1 char → skipped; "sabourdin" aligns to the
    // fake's 2nd token only if present at that index.
    const aliases = emailNameAliases("j.sabourdin@gmail.com", "nathan.brivet@gmail.com");
    expect(aliases).not.toContainEqual(["Nathan", "T"]);
    expect(aliases).toContainEqual(["Brivet", "Sabourdin"]);
  });

  it("never maps a token to itself", () => {
    const aliases = emailNameAliases("nathan.morvan@gmail.com", "nathan.brivet@gmail.com");
    // first tokens identical ("nathan") → no alias; only the differing last name
    expect(aliases.every(([f, r]) => f.toLowerCase() !== r.toLowerCase())).toBe(true);
    expect(aliases).toContainEqual(["Brivet", "Morvan"]);
  });
});

describe("buildFakeEmail (vault-aware, atomic identity)", () => {
  const never = () => false;

  it("REUSES a person's canonical fake for the local-part first name", () => {
    // "Julien" is already faked "Nathan" → the email must read nathan.<fake>@…
    const email = buildFakeEmail("julien.talvas@gmail.com", 0, (r) => (r === "Julien" ? "Nathan" : undefined), never);
    expect(email).toMatch(/^nathan\.[a-z]+@/);
    // and the derived alias set aligns nathan↔julien (reversible greeting)
    expect(emailNameAliases("julien.talvas@gmail.com", email)).toContainEqual(["Nathan", "Julien"]);
  });

  it("picks a FRESH pool name for a first-seen person (deterministic, not the real one)", () => {
    const email = buildFakeEmail("julien.talvas@gmail.com", 0, () => undefined, never);
    expect(email).toMatch(/^[a-z]+\.[a-z]+@/);
    expect(email).not.toContain("julien");
    // deterministic for the same (email, attempt)
    expect(buildFakeEmail("julien.talvas@gmail.com", 0, () => undefined, never)).toBe(email);
  });

  it("avoids a fresh name that is already taken", () => {
    // Force every FIRST-name pool pick except the eventual one to be 'taken';
    // simplest: mark the natural pick taken and assert the output differs from it.
    const natural = buildFakeEmail("julien.talvas@gmail.com", 0, () => undefined, never);
    const naturalFirst = natural.split(".")[0];
    const avoided = buildFakeEmail("julien.talvas@gmail.com", 0, () => undefined, (c) => c.toLowerCase() === naturalFirst);
    expect(avoided.split(".")[0]).not.toBe(naturalFirst);
  });

  it("does NOT inject a name into a generic mailbox (scrambles instead)", () => {
    const email = buildFakeEmail("contact@acme.com", 0, () => undefined, never);
    expect(email).not.toMatch(/nathan|lucas|emma/i);
    // No phantom NAME alias — every alias produced is the DOMAIN (real value has a dot).
    const aliases = emailNameAliases("contact@acme.com", email);
    expect(aliases.every(([, real]) => real.includes("."))).toBe(true);
  });

  it("fakes + aliases the DOMAIN after the @ (different from the real, stored in vault)", () => {
    const email = buildFakeEmail("julien.talvas@gmail.com", 0, () => undefined, never);
    const fakeDom = email.split("@")[1];
    expect(fakeDom).not.toBe("gmail.com"); // the real domain never leaks
    // the domain is a reversible alias fakeDom -> gmail.com
    expect(emailNameAliases("julien.talvas@gmail.com", email)).toContainEqual([fakeDom, "gmail.com"]);
  });

  it("REUSES a domain's canonical fake across emails (atomic domain)", () => {
    // "gmail.com" already faked "mail.com" → a later gmail address reuses "mail.com".
    const email = buildFakeEmail("alice.savary@gmail.com", 0, (r) => (r === "gmail.com" ? "mail.com" : undefined), never);
    expect(email.split("@")[1]).toBe("mail.com");
  });
});
