// La porte du PÉRIMÈTRE d'un tour d'abonnement. Le cas qui la motive est mesuré, pas
// supposé : avec un retrait par NOM (`--disallowed-tools Bash Edit Read …`) la CLI 2.1.247
// annonçait quand même une poignée d'outils intégrés, dont un qui prend une commande shell
// et rend sa sortie au modèle — c'est-à-dire des octets que le coffre n'a jamais vus, donc
// que le re-redaction ne peut pas masquer (règle 11). La propriété à tenir : SEUL le pont
// de l'app existe pour le modèle, et une annonce qui dit autre chose fait échouer le tour.
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
    // Les noms exacts relevés sur la 2.1.247 sous les anciens drapeaux.
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
    // Volontaire, et documenté dans l'en-tête : le contrôle premier est `--tools ""`,
    // qui est auto-vérifiant (la CLI refuse un drapeau inconnu). Refuser ici couperait
    // le chat au premier renommage de champ sans rien acheter.
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
