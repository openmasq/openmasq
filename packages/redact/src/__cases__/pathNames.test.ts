import { describe, it, expect } from "vitest";
import { pseudonymize, unredact, redact, type Vault } from "../index";
import type { Detection } from "../types";
import { scoreCorpus, oracleDetector } from "./pathNames.measure";

/* A path is masked LIKE A SENTENCE (`model/paths.ts`, `model/pathText/`): structure and
   meaning words stay, the username becomes a realistic account name, each entity found in a
   segment takes ITS OWN vault fake, an identifier token a same-shape fake; at Strict a word no
   lexicon vouches for becomes a pronounceable stand-in, below Strict it stays (the accepted
   residual, `model/CLAUDE.md`).

   Measured over `pathNames.corpus.ts` (45 invented paths) — before this design, every
   distinctive segment was a random same-length string, and the path RULE stopped at the first
   lowercase word of a folder (« Harlan v. Whitcombe/ » shipped « Whitcombe » in clear):
     strict   leak 5   meaning 127/266 (0.48)  restore 177/179
   after:
     strict   leak 0   meaning 257/266 (0.97)  restore 179/179
     relaxed  leak 1   meaning 263/266 (0.99)  restore 179/179   (deterministic only — the residual)
     relaxed + NER     leak 0   meaning 263/266                    restore 179/179 */

// What the app passes: Strict turns every category on and both notoriety flags off; below
// Strict with `path` switched on (a custom set), people notoriety is explicitly ON.
const STRICT = { peopleNotoriety: false, commercialNotoriety: false, disabledKinds: [] as string[] };
const RELAXED = { peopleNotoriety: true, commercialNotoriety: true, disabledKinds: ["url", "date"] };

describe("the path corpus — floors", () => {
  it("Strict: nothing annotated leaks, the meaning stays, everything restores", async () => {
    const s = await scoreCorpus(STRICT);
    expect(s.leaks).toEqual([]);
    expect(s.meaningKept / s.meaningTotal).toBeGreaterThanOrEqual(0.95);
    expect(s.failures).toEqual([]);
  });

  it("below Strict with a NER: nothing leaks, and even more meaning stays", async () => {
    const s = await scoreCorpus({ ...RELAXED, detectLocal: oracleDetector });
    expect(s.leaks).toEqual([]);
    expect(s.meaningKept / s.meaningTotal).toBeGreaterThanOrEqual(0.97);
    expect(s.failures).toEqual([]);
  });

  it("below Strict, rules only: the residual is a lone unknown word, and stays that small", async () => {
    const s = await scoreCorpus(RELAXED);
    expect(s.leaks.length).toBeLessThanOrEqual(1);
    expect(s.failures).toEqual([]);
  });
});

const PATH_A = "/Users/jdoe/Clients/Ostrander Conseil/Facture_Ostrander_Conseil_2024.pdf";
const orgDetector = async (text: string): Promise<Detection[]> =>
  [...text.matchAll(/Ostrander[ _]Conseil/g)].map((m) => ({ value: m[0], category: "ORG" }));

describe("one real value, one fake — in a path and in prose", () => {
  it("a company in a folder, a file name and a sentence wears ONE fake", async () => {
    const vault: Vault = {};
    const input = `Le client Ostrander Conseil a envoyé ${PATH_A}`;
    const { text } = await pseudonymize(input, { ...RELAXED, vault, detectLocal: orgDetector });
    expect(text).not.toContain("Ostrander");
    const fake = Object.entries(vault).find(([, v]) => v === "Ostrander Conseil")?.[0] as string;
    expect(fake).toBeTruthy();
    expect(text).toContain(`Le client ${fake} a envoyé`);
    expect(text).toContain(`/${fake}/`);
    expect(text).toContain(`Facture_${fake.replace(/\s+/g, "_")}_2024.pdf`);
    expect(unredact(text, vault)).toBe(input);
  });

  it("a path the model RECOMPOSES from parts of two paths restores part by part", async () => {
    const vault: Vault = {};
    const other = "/Users/jdoe/Documents/Kerlavec Dossier/Plan.pdf";
    const { text: fa } = await pseudonymize(PATH_A, { ...STRICT, vault, detectLocal: orgDetector });
    const { text: fb } = await pseudonymize(other, { ...STRICT, vault });
    const dirB = fb.slice(0, fb.lastIndexOf("/"));
    const fileA = fa.slice(fa.lastIndexOf("/") + 1);
    expect(unredact(`${dirB}/${fileA}`, vault)).toBe("/Users/jdoe/Documents/Kerlavec Dossier/Facture_Ostrander_Conseil_2024.pdf");
    // The username alone, as the model writes it in a sentence.
    const user = fa.split("/")[2];
    expect(unredact(`le compte ${user} a les droits`, vault)).toBe("le compte jdoe a les droits");
  });
});

describe("the username becomes a realistic account name", () => {
  const userOf = async (path: string, opts: object = {}) =>
    (await pseudonymize(path, { ...STRICT, vault: {}, ...opts })).text.split(/[\\/]/)[2];

  it("in the original's style, never a random string", async () => {
    expect(await userOf("/Users/jdoe/Documents/Kerlavec.pdf")).toMatch(/^[a-z]{4,}$/);
    expect(await userOf("/home/claire.monfort/notes/Kerlavec.pdf")).toMatch(/^[a-z]+\.[a-z]+$/);
    expect(await userOf("C:\\Users\\Nadia\\Documents\\Kerlavec.pdf")).toMatch(/^[A-Z][a-z]+$/);
    expect(await userOf("/Users/dev42/Documents/Kerlavec.pdf")).toMatch(/^[a-z]+\d{2}$/);
  });

  it("deterministic per conversation, different across conversation keys", async () => {
    const p = "/Users/jdoe/Documents/Kerlavec.pdf";
    expect(await userOf(p, { salt: 7 })).toBe(await userOf(p, { salt: 7 }));
    const keys = ["11", "22", "33", "44"].map((b) => b.repeat(32));
    const fakes = new Set(await Promise.all(keys.map((key) => userOf(p, { key }))));
    expect(fakes.size).toBeGreaterThan(1);
  });

  it("two users never share a fake account name", async () => {
    const vault: Vault = {};
    const users = ["jdoe", "jdupuis", "jdaniel", "jdavid", "jdenis", "jdumas", "jdurand", "jdelmas"];
    const fakes = new Set<string>();
    for (const u of users) fakes.add((await pseudonymize(`/Users/${u}/Desktop/x.pdf`, { ...STRICT, vault })).text.split("/")[2]);
    expect(fakes.size).toBe(users.length);
  });
});

describe("a word nothing detected: pronounceable at Strict, verbatim below", () => {
  const p = "/Users/Shared/Projets/projet-alpha-v2/notes.md";
  it("Strict: same separators, word-shaped, the version kept", async () => {
    const { text } = await pseudonymize(p, { ...STRICT, vault: {} });
    const m = /\/Projets\/projet-([a-z]+)-v2\/notes\.md$/.exec(text);
    expect(m?.[1]).toBeTruthy();
    expect(m?.[1]).not.toBe("alpha");
    expect(m?.[1]).toMatch(/^(?:[aeiou]?(?:[bcdfghjklmnprstvz][aeiou])+[bcdfghjklmnprstvz]?)$/);
  });
  it("below Strict: nothing identifying was found, the path stays as it is", async () => {
    const vault: Vault = {};
    expect((await pseudonymize(p, { ...RELAXED, vault })).text).toBe(p);
    expect(vault).toEqual({});
  });
});

describe("file-name recall (rules only, below Strict)", () => {
  const masked = async (path: string) => (await pseudonymize(path, { ...RELAXED, vault: {} })).text;

  it.each([
    ["/Users/Shared/Documents/Cases/Harlan v. Whitcombe/Motion.docx", ["Harlan", "Whitcombe"]],
    ["/Users/Shared/Documents/Litigation/Deposition of Ellen Prusik.pdf", ["Ellen", "Prusik"]],
    ["/Users/Shared/Documents/Medical Records/Lab Results Dr. Petrakos.pdf", ["Petrakos"]],
    ["/Users/Shared/Documents/Compta/Grand livre 2024 SARL Vendrance.xlsx", ["Vendrance"]],
    ["/Users/Shared/Documents/Clients/Tessaro Holdings/Board Minutes.docx", ["Tessaro"]],
    ["/Users/Shared/Documents/Thornquist Family Trust/Trust Amendment.pdf", ["Thornquist"]],
    ["/Users/Shared/Documents/Clients/Marlow & Finchley/Retainer.pdf", ["Marlow", "Finchley"]],
    ["/Users/Shared/Documents/Societe/Dépôt des comptes 2022B48213 774019362-1.pdf", ["2022B48213", "774019362"]],
  ])("catches what identifies in %s", async (path, secrets) => {
    const text = await masked(path);
    for (const s of secrets) expect(text).not.toContain(s);
  });

  it.each([
    "/Users/Shared/Documents/Scans/Facture Mars 2026.pdf",
    "/Users/Shared/Documents/Invoices/Invoice Final Report March 2025.pdf",
    "/Users/Shared/Documents/Rapport Scan Facture.pdf",
    "/Users/Shared/Documents/Meeting Notes/Board Minutes June 2025.docx",
    "/Users/Shared/Documents/Engagement Letter Signed Copy.pdf",
    "/Users/Shared/Documents/Bulletin de salaire Octobre 2025.pdf",
    "/Users/Shared/Documents/Screenshot 2026-02-11 at 10.42.17.png",
  ])("leaves a name made of common words alone: %s", async (path) => {
    expect(await masked(path)).toBe(path);
  });

  it("a public body a NER tags as a company stays readable too", async () => {
    const path = "/Users/Shared/Greffe/Facture du Greffe du tribunal des activités économiques de Lyon.pdf";
    const detectLocal = async (t: string): Promise<Detection[]> =>
      [...t.matchAll(/Greffe du tribunal des activités économiques de Lyon/g)].map((m) => ({ value: m[0], category: "ORG" }));
    expect((await pseudonymize(path, { ...RELAXED, vault: {}, detectLocal })).text).toBe(path);
  });

  it("a public body stays readable, at every level", async () => {
    const path = "/Users/lmercier/Documents/Greffe/Facture du Greffe du tribunal des activités économiques de Lyon.pdf";
    for (const o of [STRICT, RELAXED]) {
      const { text } = await pseudonymize(path, { ...o, vault: {} });
      expect(text).toContain("/Greffe/Facture du Greffe du tribunal des activités économiques de ");
      expect(text).not.toContain("lmercier");
    }
  });
});

describe("fail CLOSED", () => {
  it("segment detection that throws ⇒ the full-segment scramble, never verbatim", async () => {
    const path = "/Users/jdoe/Documents/Kerlavec Notes/Plan cuisine.pdf";
    // The main pass succeeds; only the per-segment pass (its document has no `/`) throws.
    const detectLocal = async (t: string): Promise<Detection[]> => {
      if (!t.includes("/")) throw new Error("ner down");
      return [];
    };
    const vault: Vault = {};
    const { text } = await pseudonymize(path, { ...RELAXED, vault, detectLocal });
    expect(text).not.toContain("Kerlavec");
    expect(text).not.toContain("jdoe");
    expect(text).not.toContain("Plan cuisine");
    expect(unredact(text, vault)).toBe(path);
  });
});

describe("the path RULE spans a folder or file name that holds lowercase words", () => {
  it("one span for the whole path", () => {
    const p = "/Users/ann/Cases/Harlan v. Whitcombe/Deposition of Ellen Prusik 2026-03-04.pdf";
    expect(redact(`voir ${p} merci`).matches.map((m) => m.value)).toEqual([p]);
  });
  it("never merges two paths of a command line, never swallows prose after a path", () => {
    const values = redact("mv /Users/ann/a.pdf backup/old").matches.map((m) => m.value);
    expect(values[0]).toBe("/Users/ann/a.pdf");
    expect(redact("dans /Users/ann/Downloads et puis on continue").matches[0].value).toBe("/Users/ann/Downloads");
  });
});
