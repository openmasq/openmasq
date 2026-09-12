import { describe, it, expect } from "vitest";
import { pseudonymize } from "../../index";
import { formatHead } from "../fakes/credentialShape";
import { buildFakeWordIndex } from "./fakeWordIndex";

/* Regression from a real incident: a CSV drop mints «20000 Ajaccio», «…76000 Rouen» and
   «Hugo»; the next pass (memory injection, same vault) mints «Ajaccio», «Rouen» and
   «hugo» as STANDALONE fakes of other values. The model answers about the CSV's
   fictional geography, and de-redaction rewrites its «Rouen (76000)» into «Paris (76000)». One word = one
   identity, that's the invariant pinned here. */

describe("FakeWordIndex — le prédicat", () => {
  const idx = buildFakeWordIndex({
    "40 avenue Victor Hugo, 76000 Rouen": "59 Rue Alexandre Duval, 35000 Rennes",
    "20000 Ajaccio": "35760 Rennes",
    "Hugo": "Amrok",
    "60000 Beauvais": "94800 Villejuif",
  });

  it("rejette un faux autonome égal à un mot d'un faux existant (l'incident)", () => {
    expect(idx.clashes("Ajaccio", "Vitry surSeine")).toBe(true);
    expect(idx.clashes("Rouen", "Paris")).toBe(true);
  });

  it("rejette dans l'AUTRE sens : un faux long avalant un faux court existant", () => {
    expect(idx.clashes("12 rue d'Ajaccio, 20000 Ajaccio", "8 rue des Prés, 44000 Nantes")).toBe(true);
  });

  it("insensible à la casse — «hugo» pendant que «Hugo» est pris (wordTaken)", () => {
    expect(idx.wordTaken("hugo")).toBe(true);
    expect(idx.wordTaken("HUGO")).toBe(true);
  });

  it("EXEMPTE le même lieu — la cohérence de bloc géo est voulue", () => {
    // «Beauvais» alone for the real «Villejuif» while «60000 Beauvais» covers
    // «94800 Villejuif»: both reals describe the same place, correct de-redaction.
    expect(idx.clashes("Beauvais", "Villejuif")).toBe(false);
    // The same word for an UNRELATED real stays a clash — the corruption case.
    expect(idx.clashes("Beauvais", "F. Faure")).toBe(true);
  });

  it("n'indexe pas les mots-outils qui se répètent entre faux PAR CONSTRUCTION", () => {
    // «avenue», «rue», «saint»… are shared between fake addresses without ambiguity:
    // never a vault key on their own, so never de-redacted on their own.
    expect(idx.clashes("96 avenue de la Gare", "13 Bd de Beaumont, 35000 Rennes")).toBe(false);
  });

  it("un mot inédit ne clashe pas", () => {
    expect(idx.clashes("Bastia", "Quimper")).toBe(false);
    expect(idx.wordTaken("Marceline")).toBe(false);
  });
});

describe("allocateur — l'invariant tient de bout en bout", () => {
  it("aucun faux minté ne partage un mot distinctif avec les faux d'une passe PRÉCÉDENTE", async () => {
    // The vault arrives already loaded with fakes from an earlier drop (the incident's situation).
    const vault: Record<string, string> = {
      "40 avenue Victor Hugo, 76000 Rouen": "59 Rue Alexandre Duval, 35000 Rennes",
      "20000 Ajaccio": "35760 Rennes",
      "Hugo": "Amrok",
    };
    const before = new Set(Object.keys(vault));
    const preIdx = buildFakeWordIndex(vault);
    // A pass that mints new places and names, whatever the faker's draw.
    await pseudonymize(
      "Le rendez-vous est fixé à Vitry-sur-Seine avec Maroussia Delrieux, puis retour à Paris chez M. Vernaux.",
      { vault },
    );
    for (const [fake, real] of Object.entries(vault)) {
      if (before.has(fake)) continue;
      expect(preIdx.clashes(fake, real), `«${fake}» réutilise un mot déjà en service`).toBe(false);
    }
  });
});

/* A CREDENTIAL's fake keeps its vendor's public head verbatim, so every credential of one
   family carries the same head. Read as a distinctive word it belongs to whichever value
   was faked FIRST, and every later candidate of the family clashes on all 60 attempts —
   the pool exhausts and the value falls back to the neutral `redacted-N` series, losing the
   shape a coding agent reads. The head is format, never identity: `credentialShape.ts`
   `formatHead` is where the index asks which part that is. */
describe("a vendor's public head is format, not an identity", () => {
  const KEY = "ab".repeat(32); // the per-vault HMAC key, hex
  const PROSE_OFF = ["name", "username", "company", "address", "location", "dob", "date", "path", "url"];
  const pseudo = (text: string) => {
    const vault: Record<string, string> = {};
    return pseudonymize(text, { vault, key: KEY, mode: "fake", disabledKinds: PROSE_OFF, numbers: false })
      .then(() => vault);
  };

  it("does not let the first JWT of an issuer own `eyJhbGci…` for the whole conversation", async () => {
    const header = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9";
    const vault = await pseudo(
      [`${header}.eyJzdWIiOiIxIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c`,
       `${header}.eyJzdWIiOiIyIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U`,
       `${header}.eyJzdWIiOiIzIn0.9IRgOBPI-fvk55c8A4rJardXOnqKRQu6Y9R2dqrd40I`].join("\n"),
    );
    const fakes = Object.keys(vault);
    expect(fakes).toHaveLength(3);
    for (const fake of fakes) expect(fake.startsWith(`${header}.`)).toBe(true);
    expect(fakes.filter((f) => f.startsWith("redacted"))).toEqual([]);
  });

  it("gives every key of a vendor family a fake of its own shape", async () => {
    const vault = await pseudo(
      ["sk_live_51H8xKLMNopQRstUV", "sk_live_92J4zXYWabCDefGH", "sk_live_77K1qRSTuvWXyzAB",
       "ghp_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5", "ghp_Z9y8X7w6V5u4T3s2R1q0P9o8N7m6L5"].join("\n"),
    );
    const fakes = Object.keys(vault);
    expect(fakes.filter((f) => f.startsWith("sk_live_"))).toHaveLength(3);
    expect(fakes.filter((f) => f.startsWith("ghp_"))).toHaveLength(2);
    expect(fakes.filter((f) => f.startsWith("redacted"))).toEqual([]);
  });

  /** The exemption is for CREDENTIALS only, and `formatHead` is what keeps it there: a
   *  PLACE segments exactly like a vendor prefix (`Saint-` is a word-like run ended by a
   *  separator), so the prefix shape alone may never decide this — hence the digit-and-no-
   *  whitespace test beside it. Were a place to lose its head, its words would leave the
   *  index and the «Rouen» incident above could happen again. */
  it("reads a place as prose, whatever its segments look like", () => {
    expect(formatHead("Saint-Germain-en-Laye")).toBe(0); // no digit: prose
    expect(formatHead("Bourg-la-Reine 78100")).toBe(0); // a digit, but whitespace: prose
    expect(formatHead("40 avenue Victor Hugo, 76000 Rouen")).toBe(0);
    expect(formatHead("sk_live_ABCDEFGH12345678")).toBe("sk_live_".length); // a credential
    const place = buildFakeWordIndex({ "35760 Rennes": "94800 Villejuif" });
    expect(place.clashes("Rennes", "Nantes")).toBe(true);
  });
});
