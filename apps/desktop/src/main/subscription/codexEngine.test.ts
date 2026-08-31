import { describe, expect, it } from "vitest";
import { buildCodexArgs, CODEX_DISABLED_FEATURES, type CodexTurnOptions } from "./codexEngine";

const base: CodexTurnOptions = {
  binPath: "/Users/x/.local/bin/codex",
  prompt: "Bonjour",
  cwd: "/tmp/neutre",
};

describe("buildCodexArgs", () => {
  it("sous-commande exec + prompt en argument + JSONL", () => {
    const args = buildCodexArgs(base);
    expect(args[0]).toBe("exec");
    expect(args[1]).toBe("Bonjour");
    expect(args).toContain("--json");
  });

  it("l'isolement mesuré : éphémère, config utilisateur et règles ignorées, hors git", () => {
    const args = buildCodexArgs(base);
    // `--ignore-user-config` does NOT block auth ("auth still uses CODEX_HOME"):
    // it's the counterpart of claude's `--safe-mode`.
    for (const f of ["--ephemeral", "--ignore-user-config", "--ignore-rules", "--skip-git-repo-check"])
      expect(args).toContain(f);
  });

  it("sandbox en LECTURE SEULE", () => {
    const args = buildCodexArgs(base);
    expect(args[args.indexOf("--sandbox") + 1]).toBe("read-only");
  });

  it("coupe l'exécution de commandes — le drapeau qui compte (mesuré : sans lui, la CLI lance /bin/zsh -lc)", () => {
    const args = buildCodexArgs(base);
    expect(CODEX_DISABLED_FEATURES).toContain("shell_tool");
    for (const f of CODEX_DISABLED_FEATURES) {
      expect(args[args.indexOf(f) - 1]).toBe("--disable");
    }
  });

  it("aucun `-m` : avec un compte ChatGPT, un modèle explicite est refusé (400 mesuré)", () => {
    expect(buildCodexArgs(base)).not.toContain("-m");
    expect(buildCodexArgs(base)).not.toContain("--model");
  });
});
