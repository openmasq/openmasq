import { describe, expect, it } from "vitest";
import { buildClaudeArgs, CHAT_DISALLOWED_TOOLS, type ClaudeTurnOptions } from "./engine";

const base: ClaudeTurnOptions = {
  binPath: "/usr/local/bin/claude",
  prompt: "Bonjour",
  sessionId: "6f1a2b3c-0000-4000-8000-000000000000",
  cwd: "/tmp/neutre",
};

describe("buildClaudeArgs", () => {
  it("passe le prompt système en --system-prompt, jamais concaténé dans le prompt", () => {
    const args = buildClaudeArgs({ ...base, system: "Tu es concis." });
    const at = args.indexOf("--system-prompt");
    expect(at).toBeGreaterThan(-1);
    expect(args[at + 1]).toBe("Tu es concis.");
    expect(args[args.indexOf("-p") + 1]).toBe("Bonjour");
  });

  it("omet --system-prompt quand il n'y a pas de prompt système", () => {
    expect(buildClaudeArgs(base)).not.toContain("--system-prompt");
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
});
