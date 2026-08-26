import { describe, expect, it } from "vitest";
import { cliModelAlias } from "./turn";

describe("cliModelAlias — id registre → alias `--model` de la CLI", () => {
  it("traduit chaque famille du registre vers son alias", () => {
    expect(cliModelAlias("claude-cli-sonnet")).toBe("sonnet");
    expect(cliModelAlias("claude-cli-opus")).toBe("opus");
    expect(cliModelAlias("claude-cli-haiku")).toBe("haiku");
  });

  it("`claude-cli` nu = AUCUN drapeau — le défaut de l'abonnement (entrée historique)", () => {
    expect(cliModelAlias("claude-cli")).toBeUndefined();
  });

  it("un id inattendu rend undefined, jamais un alias inventé (le défaut, pas une erreur CLI)", () => {
    for (const id of [undefined, "", "claude-sonnet-5", "claude-cli-fable", "gpt-5.5"]) {
      expect(cliModelAlias(id)).toBeUndefined();
    }
  });
});
