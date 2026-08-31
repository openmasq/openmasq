// The PERIMETER gate for a subscription turn. The case that motivates it is measured, not
// assumed: with a removal BY NAME (`--disallowed-tools Bash Edit Read …`) CLI 2.1.247
// still advertised a handful of built-in tools, including one that takes a shell command
// and hands its output to the model — i.e. bytes the vault never saw, so
// re-redaction can't mask them (rule 11). The property to hold: ONLY the app's
// bridge exists for the model, and an advertisement that says otherwise fails the turn.
import { describe, expect, it } from "vitest";
import { cliToolGateMessage, unexpectedCliTools } from "./toolGate";

describe("unexpectedCliTools — allow-list par préfixe du pont (règle 7)", () => {
  it("laisse passer le tour TEXTE : aucun outil annoncé", () => {
    expect(unexpectedCliTools([])).toEqual([]);
  });

  it("laisse passer le tour OUTILLÉ : seuls les outils du pont", () => {
    expect(unexpectedCliTools(["mcp__openmasq__recherche", "mcp__openmasq__gmail__list"])).toEqual([]);
  });

  it("REFUSE un outil intégré que l'app n'a pas offert", () => {
    // The exact names observed on 2.1.247 under the old flags.
    expect(unexpectedCliTools(["Monitor", "CronCreate", "TaskCreate"])).toEqual([
      "Monitor",
      "CronCreate",
      "TaskCreate",
    ]);
  });

  it("refuse l'intrus MÊME mêlé aux outils légitimes du pont", () => {
    expect(unexpectedCliTools(["mcp__openmasq__recherche", "Monitor"])).toEqual(["Monitor"]);
  });

  it("refuse un serveur MCP qui n'est PAS le pont — le préfixe est le nôtre, pas « mcp »", () => {
    expect(unexpectedCliTools(["mcp__autre__outil"])).toEqual(["mcp__autre__outil"]);
  });

  it("ne rend AUCUN verdict sur une annonce absente ou d'une autre forme", () => {
    // Deliberate, and documented in the header: the primary control is `--tools ""`,
    // which is self-verifying (the CLI refuses an unknown flag). Refusing here would break
    // chat on the first field rename, buying nothing.
    expect(unexpectedCliTools(undefined)).toEqual([]);
    expect(unexpectedCliTools("Monitor")).toEqual([]);
    expect(unexpectedCliTools({ 0: "Monitor" })).toEqual([]);
  });
});

describe("cliToolGateMessage", () => {
  it("nomme ce qui dépasse, et borne la liste", () => {
    const msg = cliToolGateMessage(["Un", "Deux", "Trois", "Quatre", "Cinq", "Six", "Sept"]);
    expect(msg).toContain("Un, Deux, Trois, Quatre, Cinq (+2)");
    expect(msg).not.toContain("Six");
    expect(msg).not.toContain("Sept");
  });
});
