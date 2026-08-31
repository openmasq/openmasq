import { describe, expect, it, vi } from "vitest";
import { connectorOfTool, makeStruggleReporter } from "./toolStruggle";

/**
 * The MCP client has only ONE connection and rewrites every tool's `serverId` to its
 * transport id (« ipc »). A report reading that field produced the caption « Ipc a
 * refusé l'appel… » — and a « Reconnecter » button that opened nobody's card.
 */
describe("connectorOfTool — l'identité est le NOM de l'outil", () => {
  it("prend le préfixe, jamais le transport", () => {
    expect(connectorOfTool("gmail__search_messages", "ipc")).toBe("gmail");
  });
  it("le suffixe multi-compte tombe : c'est la FICHE qu'on ouvre", () => {
    expect(connectorOfTool("gmail--a1b2__send_email", "ipc")).toBe("gmail");
  });
  it("un nom nu (outil intercepté) garde le repli", () => {
    expect(connectorOfTool("run_python", "python")).toBe("python");
  });
});

describe("makeStruggleReporter — ce qui est rapporté nomme le connecteur", () => {
  const reporter = (onToolStruggle: (i: unknown) => void) =>
    makeStruggleReporter({
      // Exactly what the loop observes: everything comes from « ipc ».
      serverOf: () => "ipc",
      onToolStruggle: onToolStruggle as never,
      provider: "openai",
      modelId: "gpt-x",
    });

  it("un refus de connecteur désigne « gmail », pas « ipc »", () => {
    const seen = vi.fn();
    const r = reporter(seen);
    r.connectorErrored.add("gmail__search_messages");
    r.emit();
    expect(seen).toHaveBeenCalledWith({
      server: "gmail",
      tool: "gmail__search_messages",
      kind: "connector_error",
    });
  });

  it("un outil inventé aussi — c'est la même fiche qui répare", () => {
    const seen = vi.fn();
    const r = reporter(seen);
    r.markUnknownTool("linear__invent_issue");
    r.emit();
    expect(seen).toHaveBeenCalledWith({
      server: "linear",
      tool: "linear__invent_issue",
      kind: "unknown_tool",
    });
  });
});
