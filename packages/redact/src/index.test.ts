import { describe, it, expect } from "vitest";
import {
  redact,
  unredact,
  unredactArgs,
  pseudonymize,
  computeTokenFormulas,
  type Vault,
} from "./index";

describe("unredactArgs — URL-encoding-aware de-redaction of tool args", () => {
  const vault: Vault = { "Adam Berthonbqt": "mcp playwwright", Oscorp: "google" };

  it("restores a fake sitting URL-encoded in a query string (space → +)", () => {
    // The plain unredact misses "Adam+Berthonbqt" (it looks for the space form),
    // so the FAKE would leak to the browser/search engine.
    expect(unredact("https://x.com/?q=Adam+Berthonbqt", vault)).toContain("Adam+Berthonbqt");
    expect(unredactArgs("https://x.com/?q=Adam+Berthonbqt", vault)).toBe(
      "https://x.com/?q=mcp+playwwright",
    );
  });

  it("restores a percent-encoded fake (%20) and keeps the encoding valid", () => {
    expect(unredactArgs("https://x.com/?q=Adam%20Berthonbqt", vault)).toBe(
      "https://x.com/?q=mcp%20playwwright",
    );
  });

  it("restores a fake with a SPECIAL char in the MIXED query encoding (space=+, &=%26)", () => {
    // The reported navigation leak: a fake "Fenwick & Co" a search box encodes as
    // "Fenwick+%26+Co" (space→+, &→%26) — neither the plain-`+` nor the all-`%` form —
    // reached the search engine un-restored. The mixed form must now restore.
    const v: Vault = { "Fenwick & Co": "bridge audio" };
    expect(unredactArgs("q=Fenwick+%26+Co+entreprise", v)).toBe("q=bridge+audio+entreprise");
    // the two other encodings still work
    expect(unredactArgs("q=Fenwick+&+Co", v)).toBe("q=bridge+audio");
    expect(unredactArgs("q=Fenwick%20%26%20Co", v)).toBe("q=bridge%20audio");
  });

  it("still restores plain (non-encoded) occurrences like unredact", () => {
    expect(unredactArgs("cherche Adam Berthonbqt sur Oscorp", vault)).toBe(
      "cherche mcp playwwright sur google",
    );
  });

  it("restores a fake wrapped in percent-encoded quotes (Google q=\"…\" search)", () => {
    // The model builds an EXACT-phrase search `q="Fake Name"` → `%22Fake+Name%22`. The
    // `%22` before the fake ends in a digit ("2"), which `isWordGlued` used to read as a
    // word-glue and SKIP — so the fake leaked to Google instead of the real value being
    // searched. A `%XX` tail is an encoded delimiter, not a word: the fake must restore.
    expect(
      unredactArgs("https://google.com/search?q=%22Adam+Berthonbqt%22", vault),
    ).toBe("https://google.com/search?q=%22mcp+playwwright%22");
    // A single-word fake wrapped the same way (no space → no `+`-form) restores too.
    expect(unredactArgs("q=%22Oscorp%22", vault)).toBe("q=%22google%22");
  });
});

describe("unredact — case-insensitive (models UPPER-CASE fakes in formal output)", () => {
  const vault: Vault = {
    "Oslen Group": "Karl Studio",
    "Jade Savel": "Julien Sabourdin",
    Jade: "Julien", jade: "julien", Savel: "Sabourdin", savel: "sabourdin",
  };
  it("restores an ALL-CAPS fake company + person (a legal procès-verbal)", () => {
    expect(
      unredact("La société OSLEN GROUP, représentée par Madame Jade SAVEL.", vault),
    ).toBe("La société Karl Studio, représentée par Madame Julien Sabourdin.");
    // A lone uppercased surname alias reverses too (was the "Julien SAVEL" hybrid).
    expect(unredact("Signé SAVEL", vault)).toBe("Signé Sabourdin");
    // Exact-case restore is unchanged.
    expect(unredact("Jade Savel chez Oslen Group", vault)).toBe("Julien Sabourdin chez Karl Studio");
  });

  it("restores a SLUGIFIED fake (space → hyphen/underscore in a filename/URL)", () => {
    // The model turns a fake company into a filename slug ("oslen-group"), which a
    // space-only reverse left as the fake. A multi-word key now matches any `[\s_-]+`
    // separator between its words.
    expect(unredact("/procès-verbal-oslen-group.txt", vault)).toBe("/procès-verbal-Karl Studio.txt");
    expect(unredact("doc oslen_group pour jade_savel", vault)).toBe("doc Karl Studio pour Julien Sabourdin");
    // Slug + caps together.
    expect(unredact("OSLEN-GROUP", vault)).toBe("Karl Studio");
  });
});

describe("unredact — risky short/number tokens restore CASE-SENSITIVELY (no over-restore)", () => {
  it("a number token restores only in its exact case, never a differently-cased label", () => {
    const vault: Vault = { n1: "42", n2: "1000" };
    // Exact case → restored (the intended reversal).
    expect(unredact("total n1 and n2", vault)).toBe("total 42 and 1000");
    // A standalone differently-cased "N1"/"N2" (a section/annex label) is LEFT ALONE —
    // the case-insensitive restore used to rewrite it to a real value.
    expect(unredact("See section N1 and annex N2.", vault)).toBe("See section N1 and annex N2.");
  });
  it("a very short scramble restores only exact-case (no common-word collision)", () => {
    const vault: Vault = { Xa: "Bo" };
    expect(unredact("ping Xa now", vault)).toBe("ping Bo now");
    expect(unredact("the XA airport code", vault)).toBe("the XA airport code");
  });
  it("longer / multi-word fakes still restore case-insensitively (unchanged)", () => {
    expect(unredact("OSLEN GROUP", { "Oslen Group": "Karl Studio" })).toBe("Karl Studio");
  });
});

/* The reversible-redaction guarantee, exercised across many prompts: whatever
   the regex rules redact must be perfectly restorable. This is the heart of the
   "send to a model, get your real data back" flow. */

const PROMPTS = [
  "Email marcus@acme.com about the Q3 renewal.",
  "Call me on +1 415 555 0142 or +33 6 12 34 56 78 tomorrow.",
  "Two contacts: alice@corp.io and bob@corp.io, same thread.",
  "The server is at 10.0.0.42, reach ops@infra.net if it's down.",
  "No sensitive data here, just a plain sentence.",
  "Mixed: ping sarah@x.com, fallback +44 20 7946 0958, host 192.168.1.1.",
];

describe("redact ↔ unredact round-trip", () => {
  for (const prompt of PROMPTS) {
    it(`restores the original exactly: "${prompt.slice(0, 32)}…"`, () => {
      const vault: Vault = {};
      const { text } = redact(prompt, { vault });
      // The wire text must not still contain the raw email/phone we redacted.
      for (const original of Object.values(vault)) {
        expect(text).not.toContain(original);
      }
      expect(unredact(text, vault)).toBe(prompt);
    });
  }

  it("gives the same value a stable placeholder (dedupes repeats)", () => {
    const vault: Vault = {};
    const { text, matches } = redact(
      "Mail joe@x.com, then mail joe@x.com again.",
      { vault },
    );
    // One placeholder, used twice in the text.
    expect(matches.filter((m) => m.value === "joe@x.com")).toHaveLength(1);
    const ph = matches[0].placeholder;
    expect(text.split(ph)).toHaveLength(3); // two occurrences → 3 splits
    expect(unredact(text, vault)).toBe("Mail joe@x.com, then mail joe@x.com again.");
  });

  it("restores a model reply that echoes the placeholders (keyless data-flow)", () => {
    const vault: Vault = {};
    const { text } = redact("Draft a reply to marcus@acme.com.", { vault });
    const ph = Object.keys(vault)[0];
    // Simulate the model answering with the scrubbed token in place.
    const modelReply = `Sure — I'll send it to ${ph} right away.`;
    expect(unredact(modelReply, vault)).toBe(
      "Sure — I'll send it to marcus@acme.com right away.",
    );
  });

  it("restores a multi-word token the model wrapped across lines", () => {
    // token (the fake the model saw) -> original real value.
    const vault: Vault = { "Marc Charvet": "Jean Rebour" };
    // The model broke the name across a line / added extra spacing.
    expect(unredact("Écris à Marc\nCharvet demain.", vault)).toBe(
      "Écris à Jean Rebour demain.",
    );
    expect(unredact("Écris à Marc   Charvet demain.", vault)).toBe(
      "Écris à Jean Rebour demain.",
    );
  });

  it("redacts explicit known secrets and restores them", () => {
    const vault: Vault = {};
    const secret = "sk-live-DEADBEEF1234567890";
    const { text } = redact(`Use ${secret} as the key.`, {
      vault,
      secrets: [secret],
    });
    expect(text).not.toContain(secret);
    expect(unredact(text, vault)).toBe(`Use ${secret} as the key.`);
  });

  it("does NOT flag hexadecimal IDs (Notion page/view ids in a URL) as tokens", () => {
    const url =
      "https://app.notion.com/p/354d95933ece42d7850ff96243743181?v=2ad7f1ed404345df8169dd997a31ad2e";
    // `url` éteinte = le défaut produit ; le sujet est l'id hexa DANS l'URL.
    const { text, matches } = redact(`See ${url} for details.`, { vault: {}, disabledKinds: ["url"] });
    // The hex ids are not secrets → untouched, nothing redacted.
    expect(text).toContain("354d95933ece42d7850ff96243743181");
    expect(text).toContain("2ad7f1ed404345df8169dd997a31ad2e");
    expect(matches).toHaveLength(0);
  });

  it("still flags a real high-entropy token (non-hex letter + digit)", () => {
    const vault: Vault = {};
    const token = "Xy9Kp2Qw7Lm4Rt";
    const { text } = redact(`token=${token}`, { vault });
    expect(text).not.toContain(token);
    expect(unredact(text, vault)).toBe(`token=${token}`);
  });
});

describe("pseudonymize: a name the model deduces from a faked email is reversible", () => {
  // The recurring bug: `julien.sabourdin@gmail.com` is faked to e.g.
  // `nathan.brivet@…`; a model asked to write TO it greets "Bonjour Nathan",
  // emitting a bare name that used to have no vault key → the reply showed the
  // WRONG name. The email's fake first/last name is now aliased to the real one.
  it("restores the greeting name to the REAL first name", async () => {
    const vault: Vault = {};
    const { text } = await pseudonymize(
      "Écris un mail de bonjour à julien.sabourdin@gmail.com.",
      { vault },
    );
    expect(text).not.toContain("julien.sabourdin@gmail.com");

    // Derive the fake first name the model would see (first local-part token).
    const fakeEmail = Object.keys(vault).find(
      (k) => vault[k] === "julien.sabourdin@gmail.com",
    )!;
    const fakeFirst =
      fakeEmail.split("@")[0].split(/[._+-]+/)[0].replace(/^./, (c) => c.toUpperCase());
    expect(fakeFirst.toLowerCase()).not.toBe("julien"); // it really is a fake

    // The model greets by that fake first name — must reverse to "Julien".
    const reply = `Bonjour ${fakeFirst},\n\nJ'espère que vous allez bien.`;
    expect(unredact(reply, vault)).toBe(
      "Bonjour Julien,\n\nJ'espère que vous allez bien.",
    );
  });

  it("keeps ONE atomic fake identity: a name already faked reuses that fake in a later email", async () => {
    // An earlier document established Julien -> Nathan (in the shared vault).
    const vault: Vault = { Nathan: "Julien" };
    const { text } = await pseudonymize(
      "Rappelle à Julien d'écrire à julien.talvas@gmail.com.",
      { vault },
    );
    // The standalone "Julien" stays "Nathan" (NOT a new identity)…
    expect(text).toMatch(/Rappelle à Nathan\b/);
    // …and the email's first name is the SAME "nathan", not an independent fake.
    expect(text).toMatch(/nathan\.[a-z]+@/);
    expect(text).not.toContain("julien.talvas@gmail.com");
    expect(text).not.toContain("Julien");
    // Everything still reverses to the real values.
    const restored = unredact(text, vault);
    expect(restored).toContain("Rappelle à Julien");
    expect(restored).toContain("julien.talvas@gmail.com");
  });

  it("fakes AND stores the domain after the @ (reversible on its own)", async () => {
    const vault: Vault = {};
    const { text } = await pseudonymize("Mon email est julien.talvas@gmail.com", { vault });
    expect(text).not.toContain("gmail.com"); // the real domain does not leak
    // A vault entry maps the fake domain back to the real one.
    const domainEntry = Object.entries(vault).find(([, real]) => real === "gmail.com");
    expect(domainEntry).toBeDefined();
    const [fakeDomain] = domainEntry!;
    // The model referencing just the fake domain restores to the real domain.
    expect(unredact(`Le domaine est ${fakeDomain}.`, vault)).toBe("Le domaine est gmail.com.");
  });

  it("never re-fakes a fake: a tool result echoing our own fakes mints NO new identity", async () => {
    // The browser-agent compounding bug: a page returned by a tool echoes back the
    // fake the model just typed; the NER re-detects it and used to fake it AGAIN
    // (Nathan → Jade → Jules → …), one new identity per round, unreversible.
    const vault: Vault = {
      "nathan.cros@mail.com": "julien.sabourdin@gmail.com",
      Nathan: "Julien", nathan: "julien",
      Cros: "Sabourdin", cros: "sabourdin",
    };
    const sizeBefore = Object.keys(vault).length;
    const { text } = await pseudonymize(
      "Résultats pour Nathan Cros (nathan.cros@mail.com) — profil de Nathan Cros.",
      { vault, detectLocal: async () => [{ value: "Nathan Cros", category: "NAME" }] },
    );
    // No new vault entries; the model keeps seeing the SAME fake, not a fresh one.
    expect(Object.keys(vault)).toHaveLength(sizeBefore);
    expect(text).toContain("Nathan Cros");
    expect(text).toContain("nathan.cros@mail.com");
    // …and it still reverses cleanly to the one real identity.
    expect(unredact(text, vault)).toContain("Julien Sabourdin");
  });

  it("a fake typed again (exact case) is left verbatim; a real value is never leaked (A/safe)", async () => {
    // Once "france" is the fake for another value it is a vault KEY, so typing it EXACTLY
    // must NOT mint a new fake (no fake-of-a-fake). Recognition is EXACT-case on purpose:
    // a case-insensitive test would leave a genuinely-sensitive real value in clear just
    // because it equals a fake in another casing (a leak). So a DIFFERENT casing is treated
    // as a fresh value and REDACTED, never leaked.
    const vault: Vault = { france: "amiens" };
    const exact = await pseudonymize("actualités en france ?", {
      vault,
      forced: [{ value: "france", category: "CITY" }],
    });
    expect(exact.text).toContain("france"); // exact fake → left verbatim
    expect(Object.keys(vault)).toHaveLength(1); // no new identity minted

    const other = await pseudonymize("actualités en France ?", {
      vault,
      forced: [{ value: "France", category: "CITY" }],
    });
    expect(other.text).not.toContain("France"); // different casing → redacted, NOT leaked
  });

  it("keep un-redacted a value case-INSENSITIVELY, even when already vaulted (A)", async () => {
    // Prior turn faked "france" → some place; now the user re-types it and REMOVES the
    // mark in the composer. `keep` must leave it in clear whatever the casing.
    const vault: Vault = {};
    await pseudonymize("actualités en france ?", {
      vault,
      forced: [{ value: "france", category: "CITY" }],
    });
    const { text } = await pseudonymize("actualités en France ?", {
      vault,
      forced: [{ value: "France", category: "CITY" }],
      keep: ["france"], // kept lowercase — must still spare the capitalised occurrence
    });
    expect(text).toContain("France");
  });

  it("never mints a fake that collides with a conversation word (avoid) (root fix)", async () => {
    // The root cause: a fake ("france") equalling a word the user types elsewhere. Force
    // the exact would-be fake into `avoid` → the minter must pick a DIFFERENT one, so the
    // fake can never collide with a real word already present in the conversation.
    const v1: Vault = {};
    await pseudonymize("actualités en amiens ?", {
      vault: v1,
      forced: [{ value: "amiens", category: "CITY" }],
    });
    const baseFake = Object.keys(v1).find((k) => v1[k] === "amiens")!;
    const v2: Vault = {};
    const out = await pseudonymize("actualités en amiens ?", {
      vault: v2,
      forced: [{ value: "amiens", category: "CITY" }],
      avoid: [`je suis passé à ${baseFake} hier soir`], // that word now appears in the conv
    });
    const newFake = Object.keys(v2).find((k) => v2[k] === "amiens")!;
    expect(newFake.toLowerCase()).not.toBe(baseFake.toLowerCase());
    expect(out.text).not.toContain(baseFake);
  });

  it("a new fake never reuses a REAL value already in the vault (auto-avoid) (root fix)", async () => {
    // Every existing vault ORIGINAL is avoided automatically: turn 1 vaults the real
    // "france"; turn 2's fake for another city must not reuse it (which would make one
    // string be both a fake KEY and a real VALUE — an ambiguous, corrupting collision).
    const vault: Vault = {};
    await pseudonymize("actualités en france ?", {
      vault,
      forced: [{ value: "france", category: "CITY" }],
    });
    const out = await pseudonymize("actualités en amiens ?", {
      vault,
      forced: [{ value: "amiens", category: "CITY" }],
    });
    const amiensFake = Object.keys(vault).find((k) => vault[k] === "amiens")!;
    expect(amiensFake.toLowerCase()).not.toBe("france");
    expect(out.text).not.toContain("france");
  });

  it("an entity keeps ONE identity even when its default fake collides with avoid (no split)", async () => {
    // Regression: the canonical base was cached BEFORE the collision check, so if the
    // entity's default fake clashed with `avoid`, later casings recased from that clashing
    // base, clashed again, fell to fresh fakes → the entity SPLIT into several identities.
    const v0: Vault = {};
    await pseudonymize("Karl Studio", { vault: v0, forced: [{ value: "Karl Studio", category: "ORG" }] });
    const defFake = Object.keys(v0).find((k) => v0[k] === "Karl Studio")!;
    const vault: Vault = {};
    const { text } = await pseudonymize("Karl Studio et KARL STUDIO", {
      vault,
      forced: [
        { value: "Karl Studio", category: "ORG" },
        { value: "KARL STUDIO", category: "ORG" },
      ],
      avoid: [`on parle de ${defFake} dans la presse`], // the default fake is now a conv word
    });
    expect(text).not.toContain(defFake); // the clashing default was avoided
    expect(unredact(text, vault)).toBe("Karl Studio et KARL STUDIO"); // fully reversible
    // ONE identity: every casing's fake normalises to the SAME base word-set.
    const norm = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, "");
    const bases = new Set(Object.keys(vault).map(norm));
    expect(bases.size).toBe(1);
  });

  it("NAME keeps ONE atomic identity even when a word of its fake is in avoid (no split)", async () => {
    // A person's canonical fake is REUSED across occurrences (regardless of attempt), so
    // subjecting it to the conversation-avoid check would reject every attempt when the
    // canonical shares a word with the conversation → suffixed fallback → a 2nd identity.
    // NAME/EMAIL are therefore exempt from `avoid` (their own machinery owns atomicity).
    const vault: Vault = {};
    await pseudonymize("cherche julien sabourdin", {
      vault,
      detectLocal: async () => [{ value: "julien sabourdin", category: "NAME" }],
    });
    const fake = Object.keys(vault).find((k) => vault[k] === "julien sabourdin")!;
    const fakeWord = fake.split(/\s+/)[0];
    const again = await pseudonymize("email de julien sabourdin", {
      vault,
      detectLocal: async () => [{ value: "julien sabourdin", category: "NAME" }],
      avoid: [`on cite ${fakeWord} dans un autre contexte`], // a word of the fake is present
    });
    expect(again.text).toContain(fake); // SAME canonical fake — not split
    expect(unredact(again.text, vault)).toContain("julien sabourdin");
  });
});

describe("pseudonymize: deconflict a user value colliding with an existing fake (reFakeExisting)", () => {
  it("re-fakes the user's REAL value equal to an existing fake — no leak, both threads reverse", async () => {
    // Prior turn faked amiens → "évreux" (the france-collision family). The user now genuinely
    // discusses the REAL Évreux. Without deconflict it is dropped (leak) + reverse-mapped to
    // "amiens". With `reFakeExisting` (a USER message) it gets its OWN distinct fake.
    const vault: Vault = { évreux: "amiens" };
    const { text } = await pseudonymize("actualités à évreux", {
      vault,
      forced: [{ value: "évreux", category: "CITY" }],
      reFakeExisting: true,
    });
    expect(text).not.toContain("évreux"); // NOT sent in clear (leak eliminated)
    const newFake = Object.keys(vault).find((k) => vault[k] === "évreux")!;
    expect(newFake).toBeTruthy();
    expect(newFake).not.toBe("évreux");
    expect(vault["évreux"]).toBe("amiens"); // the old entry is untouched — both coexist
    // BOTH threads reverse cleanly, no collision: the user's Évreux and the amiens thread.
    expect(unredact(text, vault)).toBe("actualités à évreux");
    // « d'amiens », pas « de amiens » : le un-redaction répare l'élision autour d'une
    // valeur restituée (`engine/elision.ts`). Ce que ce test prouve reste la
    // déconfliction — les deux fils s'inversent, sans fuite ; l'article est correct en plus.
    expect(unredact(`ville de évreux et de ${newFake}`, vault)).toBe("ville d'amiens et d'évreux");
  });

  it("WITHOUT the flag (tool-result default) the anti-compounding guard still holds", async () => {
    // A tool/browser RESULT echoing our own fake must NOT be re-faked (that mints compounding
    // identities). The guard is the default; only an authored user message opts out of it.
    const vault: Vault = { évreux: "amiens" };
    const before = Object.keys(vault).length;
    const { text } = await pseudonymize("résultat mentionnant évreux", {
      vault,
      forced: [{ value: "évreux", category: "CITY" }], // the echoed fake, re-detected
    });
    expect(text).toContain("évreux"); // left verbatim — not re-faked
    expect(Object.keys(vault)).toHaveLength(before); // no new identity minted
  });
});

describe("pseudonymize: atomic NAME identity across tool-result rounds", () => {
  // The "remapping involontaire" bug: a browser/search RESULT re-introduces the same
  // person in a DIFFERENT casing (Title-Cased "Julien Sabourdin") or only a FRAGMENT
  // (the surname alone). The NER re-detected each as fresh PII and minted a NEW fake
  // every round → one real person behind a dozen unrelated fakes, unreversible. Now a
  // faked name registers per-word aliases so every casing/fragment reuses ONE fake.
  it("reuses ONE fake for the whole name, a different casing AND a lone fragment", async () => {
    const vault: Vault = {};
    // Turn 1 — the user prompt (lowercase) establishes the person's fake.
    const first = await pseudonymize("cherche julien sabourdin", {
      vault,
      detectLocal: async () => [{ value: "julien sabourdin", category: "NAME" }],
    });
    const fake = Object.keys(vault).find((k) => vault[k] === "julien sabourdin")!;
    expect(fake).toBeTruthy();
    expect(fake.split(/\s+/)).toHaveLength(2); // a two-word fake identity
    expect(fake).toBe(fake.toLowerCase()); // primary fake matches the REAL casing (no Title tell)
    expect(first.text).toContain(fake);
    expect(first.text).not.toContain("julien sabourdin");

    // Turn 2 — a tool RESULT echoes the person Title-Cased, plus bare fragments.
    const { text } = await pseudonymize(
      "Julien Sabourdin works with Sabourdin; contact Julien directly.",
      {
        vault,
        detectLocal: async () => [
          { value: "Julien Sabourdin", category: "NAME" },
          { value: "Sabourdin", category: "NAME" },
          { value: "Julien", category: "NAME" },
        ],
      },
    );
    // No real fragment leaks to the model.
    expect(text).not.toContain("Sabourdin");
    expect(text).not.toContain("Julien");
    // The whole name maps to the SAME fake identity as turn 1, recased to THIS
    // occurrence's Title casing (the wire stays casing-consistent — a lowercase
    // sentence never shows a Title fake and vice versa)…
    expect(text.toLowerCase()).toContain(fake);
    // …and the fragments to that fake's aligned first/last words.
    const [fakeFirst, fakeLast] = fake.split(/\s+/);
    expect(text.toLowerCase()).toContain(fakeFirst);
    expect(text.toLowerCase()).toContain(fakeLast);
    // NO new IDENTITY is minted for the casing/fragments — every vault key is a
    // casing/fragment variant of the ONE fake (a casing-specific entry is fine;
    // a second unrelated fake is the bug this test exists to catch).
    const fakeWords = new Set(fake.toLowerCase().split(/\s+/));
    for (const key of Object.keys(vault)) {
      for (const w of key.toLowerCase().split(/\s+/)) expect(fakeWords.has(w)).toBe(true);
    }
    // And every fake reverses cleanly to the ONE real person. (The whole name
    // restores to the FIRST-seen casing — lowercase from turn 1 — a benign casing
    // normalisation; the fragments restore to their own casing.)
    const restored = unredact(text, vault);
    expect(restored.toLowerCase()).toContain("julien sabourdin");
    expect(restored).toContain("Sabourdin");
    expect(restored).toContain("Julien");
  });

  it("keeps a NAME atomic with the SAME person already faked via an email", async () => {
    // Cross-path atomicity: "Julien" was faked "Nathan" by an earlier email. A later
    // standalone "Julien Sabourdin" in a result must REUSE "Nathan", not a new first
    // name — else the person has two identities (email vs name path).
    const vault: Vault = { Nathan: "Julien", nathan: "julien" };
    const { text } = await pseudonymize("Profil: Julien Sabourdin.", {
      vault,
      detectLocal: async () => [{ value: "Julien Sabourdin", category: "NAME" }],
    });
    expect(text).toMatch(/Nathan \w+/); // first name reused from the email identity
    expect(text).not.toContain("Julien");
    expect(unredact(text, vault)).toContain("Julien Sabourdin");
  });

  it("reuses ONE identity for a SEPARATOR-joined name (URL slug / handle)", async () => {
    // The reported "mauvais mapping": a browser agent turns the person into a URL slug
    // ("…/wiki/Julien_Sabourdin") or a handle ("julien.sabourdin"/"julien-sabourdin").
    // `variantOccurrences` expands a name candidate to exactly those `[\s._-]`-joined
    // spellings, but the identity machinery only split on WHITESPACE — so each variant
    // failed `isNamePart` as one blob, fell to the length-matched pool fallback, and minted
    // a BRAND-NEW identity ("Julien_Sabourdin" → "Anna Volneyhsjqj" while the same person
    // was already "Louis Berthon"). One real person behind several unrelated fakes.
    const vault: Vault = {};
    // Turn 1 — establish the person's canonical fake.
    await pseudonymize("cherche julien sabourdin", {
      vault,
      detectLocal: async () => [{ value: "julien sabourdin", category: "NAME" }],
    });
    const canonical = Object.keys(vault).find((k) => vault[k] === "julien sabourdin")!;
    const [fakeFirst, fakeLast] = canonical.split(/\s+/);

    // Turn 2 — every separator-joined spelling must reuse THAT identity, keeping its own
    // separator + casing, and must reverse to the real value.
    for (const variant of ["Julien_Sabourdin", "julien.sabourdin", "julien-sabourdin"]) {
      // ⚠️ Le slug est NU, sans schéma — et c'est délibéré. Le sujet est l'identité du
      // NOM joint par séparateur ; l'envelopper dans une URL le fait dépendre de la
      // catégorie `url`, qui va dans les deux sens et masque le sujet : ACTIVE elle
      // réclame l'adresse entière, ÉTEINTE sa porte de suppression écarte tout candidat
      // confiné dans l'URL. Un slug nu teste la même chose sans cette interaction.
      const { text } = await pseudonymize(`page ${variant}`, {
        vault,
        detectLocal: async () => [{ value: variant, category: "NAME" }],
      });
      expect(text).not.toContain("Julien"); // no real fragment reaches the model
      expect(text).not.toContain("Sabourdin");
      expect(text.toLowerCase()).toContain(fakeFirst.toLowerCase()); // the SAME identity…
      expect(text.toLowerCase()).toContain(fakeLast.toLowerCase());
      const sep = variant.includes("_") ? "_" : variant.includes(".") ? "." : "-";
      expect(text).toContain(sep); // …the variant's own separator layout survives
      expect(unredact(text, vault).toLowerCase()).toContain(`julien${sep}sabourdin`);
    }
  });

  it("never fakes/aliases a name PARTICLE (no over-redaction of 'de'/'la')", async () => {
    // A NAME with particles ("Julien de la Croix") tokenises to include "de"/"la". The
    // per-word alias machinery must NOT fake them — else `<fake> → de` makes applyVault
    // redact EVERY "de"/"la" in the conversation (the reported lowercase over-redaction).
    const vault: Vault = {};
    await pseudonymize("Rapport de Julien de la Croix.", {
      vault,
      detectLocal: async () => [{ value: "Julien de la Croix", category: "NAME" }],
    });
    // No vault entry maps to a bare particle.
    for (const real of Object.values(vault)) {
      expect(["de", "la", "du", "le", "les"]).not.toContain(real.toLowerCase());
    }
    // A later sentence full of "de"/"la" is untouched by the vault.
    const { text } = await pseudonymize("La société de la ville de Lyon est active.", {
      vault,
    });
    expect(text).toContain("La société de la ville de");
  });

  it("never re-fakes a distinctive FRAGMENT of a fake company (no double redaction)", async () => {
    // The real company "Karl Studio" was faked "Tyrell Corp" earlier. A search RESULT
    // echoes just the distinctive fragment "Tyrell" (and a re-suffixed "Tyrell
    // Corporation"); the NER used to re-detect each as a fresh ORG and fake it AGAIN
    // ("Tyrell" → "Savary") — a fake-of-a-fake, the reported ORG "double redaction".
    const vault: Vault = { "Tyrell Corp": "Karl Studio" };
    const sizeBefore = Object.keys(vault).length;
    const { text } = await pseudonymize(
      "The Tyrell Corporation, or just Tyrell, makes replicants.",
      {
        vault,
        detectLocal: async () => [
          { value: "Tyrell Corporation", category: "COMPANY" },
          { value: "Tyrell", category: "COMPANY" },
        ],
      },
    );
    // NO new identity minted for the fragment; the model keeps seeing the SAME fake.
    expect(Object.keys(vault)).toHaveLength(sizeBefore);
    expect(text).toContain("Tyrell Corporation");
    expect(text).toContain("Tyrell");
    expect(text).not.toContain("Savary");
  });

  it("reuses component fakes for a GLUED handle (no ORG-glue double redaction)", async () => {
    // A person's name-parts were already faked (atelier→charlotte, verrier→savel). A
    // separatorless handle "atelierverrier" (a GitHub org / domain) is then tagged ORG.
    // It used to go through the ORG pool → a FRESH unrelated fake ("Brantley Systems"),
    // so ONE real identity hid behind TWO disconnected fakes — the reported "mauvais
    // double redaction". It must instead reuse the component fakes GLUED → "charlottesavel".
    const vault: Vault = { charlotte: "atelier", savel: "verrier" };
    const { text } = await pseudonymize("Dépôt hébergé par atelierverrier.", {
      vault,
      detectLocal: async () => [{ value: "atelierverrier", category: "ORG" }],
    });
    expect(text).toBe("Dépôt hébergé par charlottesavel.");
    expect(vault["charlottesavel"]).toBe("atelierverrier"); // reversible, atomic
    // No stray ORG-pool fake was minted for this identity.
    expect(text).not.toMatch(/Systems|Labs|Group|Holdings/);
    // The model echoing the glued fake back reverses to the REAL handle.
    expect(unredact("Contactez charlottesavel.", vault)).toBe("Contactez atelierverrier.");
  });

  it("does NOT glue-reconstruct an unrelated org that isn't fully known", async () => {
    // Only a value that segments ENTIRELY into known reals is reconstructed; a partial
    // ("atelier" + unknown "world") must fall through to a normal fresh fake, not leak.
    const vault: Vault = { charlotte: "atelier", savel: "verrier" };
    const { text } = await pseudonymize("La marque atelierworld.", {
      vault,
      detectLocal: async () => [{ value: "atelierworld", category: "ORG" }],
    });
    expect(text).not.toContain("atelierworld"); // still redacted (no leak)
    expect(text).not.toContain("charlotte"); // not a bogus partial glue
    expect(vault["atelierworld"]).toBeUndefined();
  });
});

describe("computeTokenFormulas", () => {
  const vault: Vault = { n1: "850 000", n2: "200 000", n3: "50 000" };

  it("evaluates a formula written in number tokens", () => {
    expect(computeTokenFormulas("Net = n1 - n2 - n3", vault)).toBe(
      "Net = 600 000",
    );
  });

  it("handles multiplication, division and parentheses", () => {
    expect(computeTokenFormulas("Avg = (n1 + n2) / n3", vault)).toBe(
      "Avg = 21",
    );
  });

  it("leaves a lone token (no operator) for unredact to restore later", () => {
    // Only arithmetic *formulas* are computed here; a bare token is restored
    // downstream by unredact, so it must pass through unchanged.
    expect(computeTokenFormulas("Just n1 alone, no maths.", vault)).toBe(
      "Just n1 alone, no maths.",
    );
  });

  it("is a no-op when the vault has no numeric tokens", () => {
    const input = "n1 + n2 = something";
    expect(computeTokenFormulas(input, { "[REDACTED_EMAIL_1]": "a@b.com" })).toBe(
      input,
    );
  });
});

describe("consistent fake for the same number across spacing", () => {
  it("maps two spellings of one SIRET to the SAME fake digits", async () => {
    const vault: Vault = {};
    // Same number (86347158700015), written with two different groupings.
    const { text } = await pseudonymize(
      "A) 863 471 587 00015 puis B) 863 471 587 000 15.",
      { vault },
    );
    expect(text).not.toContain("863 471 587 00015");
    expect(text).not.toContain("863 471 587 000 15");
    // Both real spellings are vaulted, and their fakes share ONE digit sequence
    // (re-laid-out per spelling) — no more two unrelated mappings for one number.
    const fakes = Object.keys(vault).filter(
      (f) => vault[f].replace(/\D/g, "") === "86347158700015",
    );
    expect(fakes.length).toBeGreaterThanOrEqual(2);
    expect(new Set(fakes.map((f) => f.replace(/\D/g, ""))).size).toBe(1);
  });
});

describe("one identity across ALL spelling variants of an entity", () => {
  it("covers casing / spacing / hyphen / glue from a SINGLE detection, reversibly", async () => {
    const vault: Vault = {};
    const input = "Karl Studio, Karl studio, KARL STUDIO, karl-studio, KarlStudio";
    // The detector tags the org ONCE (one casing) — every other spelling is expanded.
    const { text } = await pseudonymize(input, {
      vault,
      detectLocal: async () => [{ value: "Karl studio", category: "ORG" }],
    });
    // Every spelling variant is redacted (no real form survives)…
    for (const v of ["Karl Studio", "Karl studio", "KARL STUDIO", "karl-studio", "KarlStudio"]) {
      expect(text).not.toContain(v);
    }
    // …they ALL map to ONE fake identity (separators/case stripped)…
    const identities = new Set(
      Object.keys(vault).map((f) => f.toLowerCase().replace(/[\s._-]+/g, "")),
    );
    expect(identities.size).toBe(1);
    // …and each original spelling reverses exactly.
    expect(unredact(text, vault)).toBe(input);
  });
});

describe("disabling name/company/location leaves them in clear (web-search reveal case)", () => {
  // Regression for the reported bug: after revealing name/company/location for a web
  // search, those must NOT be redacted in the tool results. The store now threads the
  // reveal into `disabledKinds` in-flight; here we lock the ENGINE guarantee that a
  // disabled category is left in clear even when a detector flags it.
  const detect = async () => [
    { value: "Luc Bramentier", category: "NAME" },
    { value: "Mistral", category: "ORG" },
    { value: "Paris", category: "CITY" },
  ];
  const text = "Luc Bramentier compare Mistral depuis Paris.";

  it("redacts them when the categories are ON", async () => {
    const r = await pseudonymize(text, { vault: {}, detectLocal: detect });
    expect(r.text).not.toContain("Luc Bramentier");
    expect(r.text).not.toContain("Mistral");
    expect(r.text).not.toContain("Paris");
  });

  it("leaves them in CLEAR when name/company/location are disabled (revealed)", async () => {
    const r = await pseudonymize(text, {
      vault: {},
      detectLocal: detect,
      disabledKinds: ["name", "company", "location"],
    });
    expect(r.text).toContain("Luc Bramentier");
    expect(r.text).toContain("Mistral");
    expect(r.text).toContain("Paris");
    expect(r.matches.length).toBe(0);
  });
});

describe("unredact — case-collision between two DIFFERENT reals (audit #9)", () => {
  // Two distinct entities whose fakes differ ONLY by case (the allocator's exact-case
  // `taken` check can let this through on a pool coincidence). `unredact`'s lowercase
  // fallback used to collapse them → restore the WRONG person's value in a third casing.
  const vault: Vault = { "Oslen Group": "Karl Studio", "OSLEN GROUP": "Globex Corp" };

  it("restores each EXACT casing to its OWN real value", () => {
    expect(unredact("Le contrat Oslen Group est signé.", vault)).toBe("Le contrat Karl Studio est signé.");
    expect(unredact("Le contrat OSLEN GROUP est signé.", vault)).toBe("Le contrat Globex Corp est signé.");
  });

  it("does NOT case-insensitively restore a THIRD casing to a wrong real (leaves the fake)", () => {
    const out = unredact("Le contrat Oslen group est signé.", vault);
    expect(out).not.toContain("Karl Studio"); // never the wrong company
    expect(out).not.toContain("Globex Corp");
    expect(out).toBe("Le contrat Oslen group est signé."); // fake kept — no wrong data shown
  });

  it("still case-insensitively restores a fake owned by ONE identity (no false positive)", () => {
    const one: Vault = { "Bastia Ville": "Nantes" };
    expect(unredact("Réunion à BASTIA VILLE demain.", one)).toBe("Réunion à Nantes demain.");
  });
});
