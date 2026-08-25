import { describe, it, expect, beforeEach, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// `trash`/`open` are the two ops that need Electron's `shell` — stubbed so the gate can
// be tested headlessly. What matters is WHICH path (if any) reaches `shell`.
// `vi.hoisted` because `vi.mock` is lifted above the module scope — a plain `const` here
// is still in its temporal dead zone when the factory runs.
const { trashItem, openPath } = vi.hoisted(() => ({
  trashItem: vi.fn(async () => {}),
  openPath: vi.fn(async () => ""),
}));
vi.mock("electron", () => ({ shell: { trashItem, openPath } }));

// Le pipeline d'extraction tire pdf.js + l'OCR : hors sujet ici, où seuls comptent le
// portail traversé et ce que l'op REND au renderer.
const { extractPaths } = vi.hoisted(() => ({
  extractPaths: vi.fn(async (paths: string[]) => [
    {
      name: "note.txt",
      kind: "text",
      text: "bonjour",
      chars: 7,
      path: paths[0], // le pipeline l'ajoute TOUJOURS — c'est ce qu'il faut retirer
      mime: "text/plain",
      words: [{ text: "bonjour", x0: 0, y0: 0, x1: 9, y1: 9 }],
    },
  ]),
}));
vi.mock("../files", () => ({ extractPaths }));

import { makeMainFsOps } from "./mainOps";

/**
 * `mainOps` runs OUTSIDE the worker (a utilityProcess child has no Electron API), which
 * is the one place the grant could plausibly drift into a second policy. It doesn't:
 * these ops resolve through the SAME `grant.ts`. Pin that, plus the one rule that is
 * specific to a human clicking rather than a model calling.
 */
describe("mainOps — la corbeille et l'ouverture passent par le MÊME portail", () => {
  let root: string;
  let outside: string;
  let ops: ReturnType<typeof makeMainFsOps>;

  beforeEach(() => {
    trashItem.mockClear();
    openPath.mockClear();
    const base = mkdtempSync(join(tmpdir(), "openmasq-fs-test-"));
    root = join(base, "granted");
    outside = join(base, "ailleurs");
    mkdirSync(root);
    mkdirSync(outside);
    writeFileSync(join(root, "note.txt"), "bonjour");
    writeFileSync(join(outside, "secret.txt"), "non");
    ops = makeMainFsOps([root], []);
  });

  it("met à la corbeille un fichier situé dans un dossier autorisé", async () => {
    await ops.trash(join(root, "note.txt"));
    expect(trashItem).toHaveBeenCalledOnce();
  });

  it("refuse un chemin hors des dossiers autorisés — sans appeler shell", async () => {
    await expect(ops.trash(join(outside, "secret.txt"))).rejects.toThrow(/refusé/i);
    expect(trashItem).not.toHaveBeenCalled();
  });

  it("refuse un chemin sous un sous-arbre interdit", async () => {
    const denied = join(root, "prive");
    mkdirSync(denied);
    writeFileSync(join(denied, "clef"), "x");
    const guarded = makeMainFsOps([root], [denied]);
    await expect(guarded.trash(join(denied, "clef"))).rejects.toThrow(/refusé/i);
    expect(trashItem).not.toHaveBeenCalled();
  });

  it("refuse de mettre à la corbeille le dossier AUTORISÉ lui-même", async () => {
    // The grant allows the root (a path is `isWithin` itself), so nothing in `grant.ts`
    // stops this — and trashing it would revoke the connector's own capability as a side
    // effect of a click in a file list. The refusal lives here, deliberately.
    await expect(ops.trash(root)).rejects.toThrow(/dossier autorisé/i);
    expect(trashItem).not.toHaveBeenCalled();
  });

  it("n'ouvre dans l'application système qu'un chemin autorisé", async () => {
    await ops.open(join(root, "note.txt"));
    expect(openPath).toHaveBeenCalledOnce();
    await expect(ops.open(join(outside, "secret.txt"))).rejects.toThrow(/refusé/i);
    expect(openPath).toHaveBeenCalledOnce(); // unchanged — the refusal never reached shell
  });

  it("refuse un chemin relatif (le portail n'interprète jamais un cwd)", async () => {
    await expect(ops.trash("note.txt")).rejects.toThrow(/absolu/i);
    expect(trashItem).not.toHaveBeenCalled();
  });
});

describe("extractDocument — un aller-retour, et jamais de chemin", () => {
  let root: string;
  let outside: string;
  let ops: ReturnType<typeof makeMainFsOps>;

  beforeEach(() => {
    extractPaths.mockClear();
    const base = mkdtempSync(join(tmpdir(), "openmasq-fs-extract-"));
    root = join(base, "granted");
    outside = join(base, "ailleurs");
    mkdirSync(root);
    mkdirSync(outside);
    writeFileSync(join(root, "note.txt"), "bonjour");
    writeFileSync(join(outside, "secret.txt"), "non");
    ops = makeMainFsOps([root], []);
  });

  it("ne rend JAMAIS le chemin au renderer", async () => {
    // L'invariant de sécurité : un chemin remis au renderer est un chemin qu'un XSS
    // repasse à `files:read`, dont la porte ne s'ouvre que pour un choix du sélecteur
    // NATIF. Les octets, eux, ne confèrent rien de neuf.
    const out = await ops.extractDocument(join(root, "note.txt"));
    expect("path" in out).toBe(false);
  });

  it("rend la GÉOMÉTRIE — c'est elle qui manquait aux boîtes de redaction", async () => {
    const out = await ops.extractDocument(join(root, "note.txt"));
    expect(out.text).toBe("bonjour");
    expect(out.words).toHaveLength(1);
    expect(out.kind).toBe("text");
  });

  it("refuse un chemin hors des dossiers autorisés — sans extraire", async () => {
    await expect(ops.extractDocument(join(outside, "secret.txt"))).rejects.toThrow(/refusé/i);
    expect(extractPaths).not.toHaveBeenCalled();
  });

  it("refuse un chemin sous un sous-arbre interdit", async () => {
    const denied = join(root, "prive");
    mkdirSync(denied);
    writeFileSync(join(denied, "clef"), "x");
    const guarded = makeMainFsOps([root], [denied]);
    await expect(guarded.extractDocument(join(denied, "clef"))).rejects.toThrow(/refusé/i);
    expect(extractPaths).not.toHaveBeenCalled();
  });
});
