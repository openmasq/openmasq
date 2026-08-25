import { describe, it, expect } from "vitest";
import { FS_TOOLS } from "./tools";
import { TOOL_OPS } from "./toolOps";
import { UI_OPS } from "./uiOps";

/**
 * The filesystem worker serves the MODEL (MCP tools) and the USER (the Bibliothèque's
 * folder browser) from one process and one grant. What keeps them apart is that the
 * dispatcher looks an op up in a DIFFERENT map per `surface`, and `surface` is stamped by
 * the two call sites, never taken from a caller.
 *
 * These are the properties that make that separation real rather than stylistic. They are
 * a test and not a comment because the failure mode is silent: adding an op to the wrong
 * map hands the model a primitive nobody decided to give it.
 */
describe("les deux surfaces du worker filesystem sont disjointes", () => {
  it("la surface MODÈLE expose exactement les outils MCP déclarés", () => {
    // No tool without a handler (a listed tool that always errors), and no handler
    // without a tool (an op reachable by name that nothing declares).
    expect(Object.keys(TOOL_OPS).sort()).toEqual(FS_TOOLS.map((t) => t.name).sort());
  });

  it("aucune opération de l'UI ne porte le nom d'un outil MCP", () => {
    const tools = new Set(Object.keys(TOOL_OPS));
    for (const op of Object.keys(UI_OPS)) expect(tools.has(op)).toBe(false);
  });

  it("aucun outil MCP ne porte le nom d'une opération de l'UI", () => {
    const ui = new Set(Object.keys(UI_OPS));
    for (const name of FS_TOOLS.map((t) => t.name)) expect(ui.has(name)).toBe(false);
  });

  it("la mise à la corbeille n'existe sur AUCUNE des deux cartes du worker", () => {
    // `trash` needs Electron's `shell`, so it lives in `mainOps.ts` — and it is a
    // deliberate asymmetry, not an accident of where the API lives: the model has no
    // tool that deletes. If it ever gains one, that must be a decision, not a rename.
    expect(TOOL_OPS.trash).toBeUndefined();
    expect(UI_OPS.trash).toBeUndefined();
    expect(FS_TOOLS.some((t) => /trash|delete|corbeille|supprim/i.test(t.name))).toBe(false);
  });

  it("AUCUNE écriture de contenu sur la surface UI, ni d'octets bruts côté MODÈLE", () => {
    // The UI surface is read-only on file CONTENT: in-app editing via the sidebar was
    // removed, so the browser exposes no in-place overwrite the write gate would have
    // to cover — the model's gated `write_file` is the one write path that remains.
    // The raw-byte `read` stays UI-only (an aperçu of an image/PDF needs bytes).
    expect(TOOL_OPS.read).toBeUndefined();
    expect(TOOL_OPS.write).toBeUndefined();
    expect(UI_OPS.read).toBeTypeOf("function");
    expect(UI_OPS.write).toBeUndefined();
  });

  it("chaque outil MCP annonce son caractère mutant (le gate d'écriture en dépend)", () => {
    // `isWriteToolName` may only RAISE suspicion from annotations, so a mutating tool
    // that forgot `destructiveHint` would fall back to the verb heuristic. Pin the
    // declaration instead of trusting the name.
    const mutating = ["write_file", "edit_file", "create_directory", "move_file", "edit_document"];
    for (const t of FS_TOOLS) {
      if (mutating.includes(t.name)) expect(t.annotations?.destructiveHint).toBe(true);
      else expect(t.annotations?.readOnlyHint).toBe(true);
    }
  });
});
