import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, realpathSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeGrant } from "./grant";
import { TOOL_OPS } from "./toolOps";
import { revisionOf } from "./fileEdit";

// The IO half: `fileEdit.test.ts` proves the decisions, this proves they reach the disk
// (and that nothing reaches it when a decision refuses).
let base: string, root: string;
const bases: string[] = [];

beforeEach(() => {
  base = realpathSync(mkdtempSync(join(tmpdir(), "fstools-")));
  bases.push(base);
  root = join(base, "root");
  mkdirSync(root, { recursive: true });
});
afterAll(() => {
  for (const b of bases) rmSync(b, { recursive: true, force: true });
});

const g = () => makeGrant([root]);
const file = (name: string, content: string) => {
  const p = join(root, name);
  writeFileSync(p, content);
  return p;
};

describe("edit_file", () => {
  it("modifie le passage et laisse le reste intact", async () => {
    const p = file("a.txt", "un\ndeux\ntrois\n");
    await TOOL_OPS.edit_file!(g(), { path: p, oldText: "deux", newText: "DEUX" });
    expect(readFileSync(p, "utf8")).toBe("un\nDEUX\ntrois\n");
  });

  it("NE TOUCHE PAS le fichier quand le passage est ambigu", async () => {
    // The property that matters is not the error — it is that the file on disk is
    // byte-identical afterwards. A tool that "half-edits" then reports failure is worse
    // than one that refuses.
    const p = file("a.txt", "x\nx\n");
    await expect(TOOL_OPS.edit_file!(g(), { path: p, oldText: "x", newText: "y" })).rejects.toThrow(/2 fois/);
    expect(readFileSync(p, "utf8")).toBe("x\nx\n");
  });

  it("NE TOUCHE PAS le fichier quand le passage est introuvable", async () => {
    const p = file("a.txt", "bonjour");
    await expect(TOOL_OPS.edit_file!(g(), { path: p, oldText: "absent", newText: "y" })).rejects.toThrow(/introuvable/i);
    expect(readFileSync(p, "utf8")).toBe("bonjour");
  });

  it("reste dans le grant — un chemin hors des racines est refusé avant toute IO", async () => {
    const outside = join(base, "dehors.txt");
    writeFileSync(outside, "secret");
    await expect(
      TOOL_OPS.edit_file!(g(), { path: outside, oldText: "secret", newText: "volé" }),
    ).rejects.toThrow();
    expect(readFileSync(outside, "utf8")).toBe("secret");
  });

  it("rend la NOUVELLE révision, utilisable pour l'écriture suivante", async () => {
    const p = file("a.txt", "aaa");
    const out = await TOOL_OPS.edit_file!(g(), { path: p, oldText: "aaa", newText: "bbbb" });
    expect(out).toContain(revisionOf(statSync(p)));
    expect(out).toMatch(/\+1 caractères/);
  });
});

describe("révision — la protection contre l'écrasement concurrent", () => {
  it("refuse l'écriture quand le fichier a changé depuis la lecture", async () => {
    const p = file("a.txt", "v1");
    const stale = revisionOf(statSync(p));
    // Someone else (the user, in their editor) writes between the read and the write.
    writeFileSync(p, "v2 écrit par l'utilisateur");

    await expect(
      TOOL_OPS.write_file!(g(), { path: p, content: "v3 du modèle", expectedRevision: stale }),
    ).rejects.toThrow(/a changé depuis votre lecture/);
    expect(readFileSync(p, "utf8")).toBe("v2 écrit par l'utilisateur");
  });

  it("laisse passer l'écriture quand la révision correspond toujours", async () => {
    const p = file("a.txt", "v1");
    await TOOL_OPS.write_file!(g(), { path: p, content: "v2", expectedRevision: revisionOf(statSync(p)) });
    expect(readFileSync(p, "utf8")).toBe("v2");
  });

  it("sans `expectedRevision`, le comportement est INCHANGÉ (la garde est opt-in)", async () => {
    const p = file("a.txt", "v1");
    await TOOL_OPS.write_file!(g(), { path: p, content: "v2" });
    expect(readFileSync(p, "utf8")).toBe("v2");
  });

  it("protège aussi `edit_file`", async () => {
    const p = file("a.txt", "aaa");
    const stale = revisionOf(statSync(p));
    writeFileSync(p, "aaa modifié ailleurs");
    await expect(
      TOOL_OPS.edit_file!(g(), { path: p, oldText: "aaa", newText: "zzz", expectedRevision: stale }),
    ).rejects.toThrow(/a changé depuis votre lecture/);
  });
});

describe("écriture atomique", () => {
  it("ne laisse aucun fichier temporaire derrière elle", async () => {
    const p = file("a.txt", "v1");
    await TOOL_OPS.write_file!(g(), { path: p, content: "v2" });
    expect(readdirSync(root)).toEqual(["a.txt"]);
  });

  it("nettoie le temporaire même quand l'écriture échoue", async () => {
    // A directory where the file should be: `rename` cannot replace it, so the write
    // fails AFTER the temp file exists — the path that used to leak a `.tmp` forever.
    mkdirSync(join(root, "dir.txt"));
    await expect(TOOL_OPS.write_file!(g(), { path: join(root, "dir.txt"), content: "x" })).rejects.toThrow();
    expect(readdirSync(root)).toEqual(["dir.txt"]);
  });

  it("préserve les permissions du fichier remplacé", async () => {
    const p = file("script.sh", "#!/bin/sh\necho v1\n");
    const { chmodSync } = await import("node:fs");
    chmodSync(p, 0o755);
    await TOOL_OPS.write_file!(g(), { path: p, content: "#!/bin/sh\necho v2\n" });
    // A rewrite that silently drops the executable bit breaks the user's script.
    expect(statSync(p).mode & 0o777).toBe(0o755);
  });
});

describe("read_file — la lecture par tranches", () => {
  const lines = Array.from({ length: 10 }, (_, i) => `ligne ${i + 1}`).join("\n");

  it("rend la fenêtre demandée et dit où elle s'arrête", async () => {
    const p = file("a.txt", lines);
    const out = await TOOL_OPS.read_file!(g(), { path: p, offset: 3, limit: 2 });
    expect(out).toContain("lignes 3-4");
    expect(out).toContain("suite à partir de la ligne 5");
    // Assert on the BODY, not the whole result: the header legitimately names line 5 as
    // where the next slice starts.
    const body = out.slice(out.indexOf("\n") + 1);
    expect(body).toBe("ligne 3\nligne 4");
  });

  it("annonce la fin du fichier", async () => {
    const p = file("a.txt", lines);
    expect(await TOOL_OPS.read_file!(g(), { path: p, offset: 9, limit: 50 })).toContain("fin du fichier");
  });

  it("préserve les fins de ligne CRLF (sinon `oldText` ne correspondrait jamais)", async () => {
    const p = file("crlf.txt", "un\r\ndeux\r\ntrois\r\n");
    const out = await TOOL_OPS.read_file!(g(), { path: p, offset: 1, limit: 2 });
    expect(out).toContain("un\r\ndeux");
  });

  it("la lecture entière reste inchangée et porte la révision", async () => {
    const p = file("a.txt", "contenu");
    const out = await TOOL_OPS.read_file!(g(), { path: p });
    expect(out).toBe(`[révision ${revisionOf(statSync(p))}]\ncontenu`);
  });
});
