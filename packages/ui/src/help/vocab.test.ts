import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RETIRED_VOCAB, VOCAB_ALLOWED, VOCAB_EXEMPT_FILES, copyLiterals } from "./vocab";

/**
 * The user vocabulary has ONE word per concept only if something CHECKS it — the
 * money lexicon's lesson (`money.test.ts`), applied to the rest of the copy. The scan
 * reads the SOURCE language (`packages/i18n/src/fr/**`): English is a translation of
 * it, and a synonym that never enters the source never needs translating.
 */

const FR = join(__dirname, "../../../i18n/src/fr");

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.ts$/.test(name)) out.push(full);
  }
  return out;
}

const files = sourceFiles(FR).filter(
  (f) => !VOCAB_EXEMPT_FILES.some((e) => f.endsWith(`/${e.file}`)),
);

describe("le vocabulaire utilisateur — UN mot par concept, dans le catalogue source", () => {
  it("scanne bien le catalogue français", () => {
    expect(files.length).toBeGreaterThan(10);
    expect(files.some((f) => f.endsWith("chrome.ts"))).toBe(true);
  });

  it.each(RETIRED_VOCAB)("« $word » n'est plus employé dans une chaîne lue", ({ word, replacement, pattern }) => {
    const guilty: string[] = [];
    for (const file of files) {
      let src = readFileSync(file, "utf8");
      for (const { text } of VOCAB_ALLOWED) src = src.split(text).join("");
      for (const lit of copyLiterals(src)) {
        if (pattern.test(lit)) guilty.push(`${file.slice(FR.length + 1)}: « ${lit.slice(0, 60)} »`);
      }
    }
    expect(
      guilty,
      `« ${word} » est un synonyme retiré : le produit dit « ${replacement} » (voir help/vocab.ts)`,
    ).toEqual([]);
  });

  it("copyLiterals : les chaînes lues, jamais les clés, les commentaires ni les mots-clés ⌘K", () => {
    const src = `
      // un commentaire qui parle de redaction et de workflow
      export const x = {
        label: "Compte et réglages",
        keywords: "prompts workflows automatisation",
        tip: (n) => \`\${n} valeurs masquées\`,
      } satisfies Messages["redactTypes"];
    `;
    const lits = copyLiterals(src);
    expect(lits).toContain("Compte et réglages");
    expect(lits.some((l) => l.includes("valeurs masquées"))).toBe(true);
    expect(lits).not.toContain("redactTypes");
    expect(lits.some((l) => l.includes("workflows"))).toBe(false);
  });

  it("chaque exemption nomme sa raison — et n'exempte qu'un fragment, jamais un fichier de copie", () => {
    for (const a of VOCAB_ALLOWED) {
      expect(a.why.length).toBeGreaterThan(10);
      expect(a.text.length).toBeGreaterThan(8);
    }
    for (const e of VOCAB_EXEMPT_FILES) expect(e.why.length).toBeGreaterThan(10);
  });
});
