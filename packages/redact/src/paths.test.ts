import { describe, it, expect } from "vitest";
import { redact, pseudonymize, unredact, redactionCategory, type Vault } from "./index";

/* Filesystem paths must be redacted before a tool result goes back to a model —
   an absolute path leaks the OS username and the machine layout. The path is
   redacted reversibly, so the model gets a fake path and the REAL one is restored
   when it calls the tool back (read_file, list_directory, …). */

const HOME = "/Users/juliensabourdin/Downloads/Wine Atlas";

describe("path category", () => {
  it("classifies the `path` rule + model tags as the path category", () => {
    expect(redactionCategory("path")).toBe("path");
    expect(redactionCategory("PATH")).toBe("path");
    expect(redactionCategory("FILEPATH")).toBe("path");
    expect(redactionCategory("directory")).toBe("path");
  });

  it("regex redact() grabs the whole absolute path (incl. a space in a folder)", () => {
    const { text, matches } = redact(`Allowed directories:\n${HOME}`);
    expect(text).toBe("Allowed directories:\n[REDACTED_PATH_1]");
    expect(matches).toEqual([
      expect.objectContaining({ type: "path", value: HOME }),
    ]);
  });

  it("matches POSIX, ~, and Windows roots", () => {
    expect(redact("see /home/alice/projects/app.ts").text).toContain("[REDACTED_PATH_1]");
    expect(redact("~/Library/Application Support/Acme/keys.enc").text).toBe(
      "[REDACTED_PATH_1]",
    );
    expect(redact("C:\\Users\\Bob\\Documents\\report.docx").text).toBe(
      "[REDACTED_PATH_1]",
    );
  });

  it("does not match a path inside a URL, or ordinary slashes in prose", () => {
    // `url` éteinte = le défaut produit ; le sujet est le chemin DANS l'URL.
    expect(redact("voir https://example.com/Users/x pour info", { disabledKinds: ["url"] }).matches).toHaveLength(0);
    expect(redact("the and/or operator").matches).toHaveLength(0);
  });

  it("does not swallow trailing prose after a path", () => {
    const { matches } = redact("fichier dans /Users/tom/Downloads et puis on continue");
    expect(matches[0].value).toBe("/Users/tom/Downloads");
  });

  it("pseudonymise swaps it for a fake path: same length, root kept, no leak", () => {
    const vault: Vault = {};
    return pseudonymize(HOME, { vault }).then(({ text }) => {
      expect(text).not.toBe(HOME);
      expect(text).not.toContain("juliensabourdin");
      expect(text).toHaveLength(HOME.length); // length preserved (no size hint)
      expect(text.startsWith("/Users/")).toBe(true); // root verbatim, still path-shaped
      expect(vault[text]).toBe(HOME); // reversible
    });
  });

  it("restores the real directory when the model calls back with the fake path", async () => {
    const vault: Vault = {};
    const { text: fakeDir } = await pseudonymize(HOME, { vault });
    // The model lists the dir, then reads a file under the FAKE path it saw.
    const restored = unredact(`${fakeDir}/notes.txt`, vault);
    expect(restored).toBe(`${HOME}/notes.txt`);
  });

  it("passes the path through in clear when the category is disabled", () => {
    const { text, matches } = redact(`open ${HOME}`, { disabledKinds: ["path"] });
    expect(text).toContain(HOME);
    expect(matches).toHaveLength(0);
  });
});

describe("file & folder names (also `path`)", () => {
  it("redacts bare filenames + relative paths a listing returns", () => {
    const listing = "Contents:\n- report.docx\n- Wine Atlas.pdf\n- Downloads/budget 2024.xlsx";
    const { matches } = redact(listing);
    expect(matches.map((m) => m.value)).toEqual([
      "report.docx",
      "Wine Atlas.pdf",
      "Downloads/budget 2024.xlsx",
    ]);
  });

  it("a lowercase prose word before a capitalised filename is NOT swallowed (audit R1)", () => {
    // The bare-filename form is ANCHORED: without it, "Mets à jour README.md" produced
    // the span "jour README.md" — the model received a mutilated sentence and the vault
    // held a half-French "path". The LOOSE space-joined form stays reserved for a path
    // CONTEXT (a `/` — the `Downloads/budget 2024.xlsx` case above).
    const { matches } = redact("Mets à jour README.md et notes.txt");
    expect(matches.map((m) => m.value)).toEqual(["README.md", "notes.txt"]);
  });

  it("leaves code / web / TLD tokens untouched (curated extension list)", () => {
    const { matches } = redact("edit App.tsx and package.json, deploy to claude.ai, open index.html");
    expect(matches).toHaveLength(0);
  });

  it("does not swallow the prose before a filename", () => {
    expect(redact("I sent the final report.pdf today").matches[0].value).toBe("report.pdf");
  });

  it("pseudonymise keeps the extension and the length (plausible same-kind file)", async () => {
    const vault: Vault = {};
    const { text } = await pseudonymize("report.docx", { vault });
    expect(text).not.toBe("report.docx");
    expect(text.endsWith(".docx")).toBe(true);
    expect(text).toHaveLength("report.docx".length);
    expect(vault[text]).toBe("report.docx");
  });

  it("a model-tagged folder name (PATH) is swapped same-kind and reversibly", async () => {
    const vault: Vault = {};
    const complete = async () => JSON.stringify([{ value: "Wine Atlas", category: "PATH" }]);
    const { text } = await pseudonymize("the folder Wine Atlas is here", { vault, complete });
    expect(text).not.toContain("Wine Atlas");
    expect(unredact(text, vault)).toBe("the folder Wine Atlas is here");
  });

  it("accents and parens do not break the run — the WHOLE filename is redacted (journal 01/08)", async () => {
    // Un listing réel : « Provisoire_PENNYLANE_KARL_STUDIO_Bilan_détaillé_(2025_01_01_
    // 2025_12_31).xlsx » partait INTÉGRALEMENT EN CLAIR — `\w` (ASCII) cassait le run à
    // « détaillé » et la parenthèse l'arrêtait avant l'extension ; la variante sans
    // parenthèses n'était redacted que PARTIELLEMENT (le seul « _2025 » final).
    const leaks = [
      "Provisoire_PENNYLANE_KARL_STUDIO_Bilan_détaillé_(2025_01_01_2025_12_31).xlsx",
      "Provisoire_PENNYLANE_KARL_STUDIO_Bilan_détaillé_2025.xlsx",
      "Bilan_détaillé_(2025_01_01_2025_12_31).xlsx",
    ];
    for (const name of leaks) {
      const vault: Vault = {};
      const { text } = await pseudonymize(`[FILE] ${name}`, { vault });
      expect(text).not.toContain("PENNYLANE");
      expect(text).not.toContain("KARL_STUDIO");
      expect(text).not.toContain("détaillé");
      expect(text.endsWith(".xlsx")).toBe(true);
      expect(unredact(text, vault)).toBe(`[FILE] ${name}`);
    }
  });
});

describe("path segments are mapped CONSISTENTLY (structure preserved)", () => {
  it("fakes each shared segment identically across paths, both reversible", async () => {
    const vault: Vault = {};
    const p1 = "/Users/juliensabourdin/Desktop/BAR DU PHARE2/stock_plot.py";
    const p2 = "/Users/juliensabourdin/Desktop/BAR DU PHARE2/stocks_plot.png";
    const { text: f1 } = await pseudonymize(p1, { vault });
    const { text: f2 } = await pseudonymize(p2, { vault });

    // The shared directory prefix must fake to the EXACT same string in both —
    // otherwise an agent can't tell the two files live in the same folder.
    const dir1 = f1.slice(0, f1.lastIndexOf("/"));
    const dir2 = f2.slice(0, f2.lastIndexOf("/"));
    expect(dir1).toBe(dir2);
    expect(f1).not.toBe(f2); // different filenames → still distinct

    expect(f1.endsWith(".py")).toBe(true);
    expect(f2.endsWith(".png")).toBe(true);
    expect(f1).not.toContain("juliensabourdin");
    expect(unredact(f1, vault)).toBe(p1);
    expect(unredact(f2, vault)).toBe(p2);
  });

  it("reverses a path RECOMPOSED from a shared fake filename (navigation)", async () => {
    const vault: Vault = {};
    const dir = "/Users/ship-it/Projects/analytics";
    const file = "/Users/ship-it/Desktop/stock_plot.py";
    const { text: fDir } = await pseudonymize(dir, { vault });
    const { text: fFile } = await pseudonymize(file, { vault });

    // The model lists `analytics/` then reads the file it saw elsewhere: it builds
    // a path that was NEVER vaulted whole — only its segments were.
    const fakeFilename = fFile.slice(fFile.lastIndexOf("/") + 1);
    const restored = unredact(`${fDir}/${fakeFilename}`, vault);
    expect(restored).toBe(`${dir}/stock_plot.py`);
  });

  it("does NOT forward-alias a generic folder word (no prose over-redaction)", async () => {
    const vault: Vault = {};
    await pseudonymize("/Users/ship-it/Desktop/stock_plot.py", { vault });
    // Generic components are never vaulted, so "Desktop" (or "Users") stays a plain
    // word everywhere else in the conversation.
    expect(Object.values(vault)).not.toContain("Desktop");
    expect(Object.values(vault)).not.toContain("Users");
    // The distinctive segments ARE individually reversible.
    expect(Object.values(vault)).toContain("stock_plot.py");
  });

  it("laisse un segment GÉNÉRIQUE en clair, et ne cache que le distinctif", async () => {
    const vault: Vault = {};
    const { text } = await pseudonymize("/Users/juliensabourdin/Desktop/DOCS-perso", { vault });
    // Le modèle garde la structure lisible — c'est ce sur quoi repose une question de
    // système de fichiers (« quels documents ? », « remonte d'un dossier »).
    expect(text.startsWith("/Users/")).toBe(true);
    expect(text).toContain("/Desktop/");
    // Et il ne voit RIEN de ce qui identifie.
    expect(text).not.toContain("juliensabourdin");
    expect(text).not.toContain("DOCS-perso");
  });

  // RÉGRESSION : un segment générique était FAUSSÉ sans être vaulté — le pire des deux.
  // Le modèle perdait tout indice sémantique ET le chemin devenait irréversible dès
  // qu'il le RECOMPOSAIT au lieu de le renvoyer verbatim : `/Users/<faux>/xMxQrqR`
  // se restaurait en `/Users/juliensabourdin/xMxQrqR`, un chemin qui n'existe pas,
  // donc un outil de fichiers qui échoue ou répond sur le mauvais dossier.
  it("un chemin RECOMPOSÉ (le dossier parent) se restaure en un chemin RÉEL", async () => {
    const vault: Vault = {};
    const real = "/Users/juliensabourdin/Desktop/DOCS-perso";
    const { text: fake } = await pseudonymize(real, { vault });
    // Le modèle remonte d'un cran : ce préfixe n'a JAMAIS été vaulté entier.
    const parent = fake.slice(0, fake.lastIndexOf("/"));
    expect(unredact(parent, vault)).toBe("/Users/juliensabourdin/Desktop");
    // …et redescendre dans un sous-dossier qu'il vient de lister marche aussi.
    expect(unredact(`${parent}/Desktop`, vault)).toBe("/Users/juliensabourdin/Desktop/Desktop");
  });

  it("un chemin SANS segment distinctif reste entièrement faussé (jamais un « faux » = le réel)", async () => {
    const vault: Vault = {};
    const real = "/Users/Desktop/Documents";
    const { text } = await pseudonymize(real, { vault });
    expect(text).not.toBe(real);
    expect(unredact(text, vault)).toBe(real);
  });
});
