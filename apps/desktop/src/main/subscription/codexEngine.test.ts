import { describe, expect, it } from "vitest";
import { buildCodexArgs, CODEX_DISABLED_FEATURES } from "./codexEngine";

describe("buildCodexArgs", () => {
  // Regression: the prompt in argv died on the OS command-line cap (Windows ≈ 32 767 chars).
  it("sous-commande exec + `-` (prompt lu sur stdin, jamais en argv) + JSONL", () => {
    const args = buildCodexArgs({});
    expect(args[0]).toBe("exec");
    expect(args[1]).toBe("-");
    expect(args).toContain("--json");
  });

  it("l'isolement mesuré : éphémère, config utilisateur et règles ignorées, hors git", () => {
    const args = buildCodexArgs({});
    // `--ignore-user-config` does NOT block auth ("auth still uses CODEX_HOME"):
    // it's the counterpart of claude's `--safe-mode`.
    for (const f of ["--ephemeral", "--ignore-user-config", "--ignore-rules", "--skip-git-repo-check"])
      expect(args).toContain(f);
  });

  it("sandbox en LECTURE SEULE", () => {
    const args = buildCodexArgs({});
    expect(args[args.indexOf("--sandbox") + 1]).toBe("read-only");
  });

  it("coupe l'exécution de commandes — le drapeau qui compte (mesuré : sans lui, la CLI lance /bin/zsh -lc)", () => {
    const args = buildCodexArgs({});
    expect(CODEX_DISABLED_FEATURES).toContain("shell_tool");
    for (const f of CODEX_DISABLED_FEATURES) {
      expect(args[args.indexOf(f) - 1]).toBe("--disable");
    }
  });

  it("aucun `-m` : avec un compte ChatGPT, un modèle explicite est refusé (400 mesuré)", () => {
    expect(buildCodexArgs({})).not.toContain("-m");
    expect(buildCodexArgs({})).not.toContain("--model");
  });
});
