import { describe, expect, it } from "vitest";
import { buildClaudeArgs, CHAT_DISALLOWED_TOOLS, type ClaudeTurnOptions } from "./engine";

const base: ClaudeTurnOptions = {
  binPath: "/usr/local/bin/claude",
  prompt: "Bonjour",
  sessionId: "6f1a2b3c-0000-4000-8000-000000000000",
  cwd: "/tmp/neutre",
};

describe("buildClaudeArgs", () => {
  it("passe le prompt système par FICHIER (--system-prompt-file), jamais son texte en argv", () => {
    const args = buildClaudeArgs({ ...base, systemFile: "/tmp/openmasq-cli-x/system.txt" });
    const at = args.indexOf("--system-prompt-file");
    expect(at).toBeGreaterThan(-1);
    expect(args[at + 1]).toBe("/tmp/openmasq-cli-x/system.txt");
    expect(args).not.toContain("--system-prompt");
  });

  // Regression: the whole conversation used to ride as `-p <prompt>` and died on the OS
  // command-line cap (Windows 32 767 chars, `spawnFailure.ts`). It now rides on stdin.
  it("ne met JAMAIS le prompt en argv : -p sans argument positionnel (lu sur stdin)", () => {
    const args = buildClaudeArgs(base);
    expect(args).not.toContain("Bonjour");
    expect(args[args.indexOf("-p") + 1]).toMatch(/^--/);
  });

  it("omet --system-prompt-file quand il n'y a pas de prompt système", () => {
    expect(buildClaudeArgs(base)).not.toContain("--system-prompt-file");
  });

  it("passe l'alias de famille en --model, et aucun drapeau sans choix (défaut abonnement)", () => {
    const args = buildClaudeArgs({ ...base, model: "haiku" });
    expect(args[args.indexOf("--model") + 1]).toBe("haiku");
    expect(buildClaudeArgs(base)).not.toContain("--model");
  });

  it("ouvre une session neuve par défaut, et ne reprend que sur demande", () => {
    expect(buildClaudeArgs(base)).toContain("--session-id");
    const resumed = buildClaudeArgs({ ...base, resume: true });
    expect(resumed).toContain("--resume");
    expect(resumed).not.toContain("--session-id");
  });

  it("garde les drapeaux d'isolement ET le retrait des outils (chat grand public)", () => {
    const args = buildClaudeArgs(base);
    for (const flag of ["--safe-mode", "--setting-sources", "--strict-mcp-config"])
      expect(args).toContain(flag);
    for (const tool of CHAT_DISALLOWED_TOOLS) expect(args).toContain(tool);
  });

  // The SCOPE guard. `--disallowed-tools` removes by NAME, so it only covers what
  // someone thought to write; `--tools ""` is the allow-list, and it decides what
  // exists for the model (rule 7). A chat turn needs no built-in tool.
  it("borne le périmètre par ALLOW-LIST : aucun outil intégré (--tools \"\")", () => {
    const args = buildClaudeArgs(base);
    const at = args.indexOf("--tools");
    expect(at).toBeGreaterThan(-1);
    expect(args[at + 1]).toBe("");
  });
});
