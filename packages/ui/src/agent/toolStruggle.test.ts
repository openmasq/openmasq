import { describe, expect, it, vi } from "vitest";
import { connectorOfTool, makeStruggleReporter } from "./toolStruggle";

/**
 * Le client MCP n'a qu'UNE connexion et réécrit le `serverId` de chaque outil en son id
 * de transport (« ipc »). Un rapport qui lisait ce champ produisait la légende « Ipc a
 * refusé l'appel… » — et un bouton « Reconnecter » qui n'ouvrait la fiche de personne.
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
      // Exactement ce que la boucle observe : tout vient de « ipc ».
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
