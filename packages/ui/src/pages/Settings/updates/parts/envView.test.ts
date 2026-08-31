import { getMessages } from "@openmasq/i18n";
import { describe, expect, it } from "vitest";
import { envSwitchOffered, otherEnv, switchRefusalText } from "./envView";

const fr = getMessages("fr");

describe("envView — à qui la bascule d'environnement est proposée", () => {
  it("depuis staging, TOUJOURS : le retour en production n'est pas un privilège", () => {
    expect(envSwitchOffered({ env: "staging", stagingTester: false, crossEnv: false })).toBe(true);
  });

  it("depuis production, seulement au testeur de compte ou au privilège machine", () => {
    expect(envSwitchOffered({ env: "production", stagingTester: false, crossEnv: false })).toBe(
      false,
    );
    expect(envSwitchOffered({ env: "production", stagingTester: true, crossEnv: false })).toBe(
      true,
    );
    expect(envSwitchOffered({ env: "production", stagingTester: false, crossEnv: true })).toBe(
      true,
    );
  });

  it("otherEnv est une involution sur les deux noms", () => {
    expect(otherEnv("production")).toBe("staging");
    expect(otherEnv("staging")).toBe("production");
  });

  it("chaque refus du main a une phrase, et l'inconnu aussi", () => {
    // The refusal names the ENVIRONMENT, never the beta channel: two independent axes
    // (a single artifact), and conflating them sends the user hunting for the wrong right.
    expect(switchRefusalText("not_privileged", fr)).toMatch(/environnement de test/);
    expect(switchRefusalText("not_privileged", fr)).not.toMatch(/bêta/);
    expect(switchRefusalText("write_failed", fr)).toMatch(/rien n'a changé/);
    expect(switchRefusalText("unknown_env", fr)).toMatch(/échoué/);
    expect(switchRefusalText(undefined, fr)).toMatch(/échoué/);
  });
});

describe("envView — la pile AUTO-HÉBERGÉE", () => {
  it("depuis custom, la bascule (le retour en production) est TOUJOURS proposée — jamais un cul-de-sac", () => {
    expect(envSwitchOffered({ env: "custom", stagingTester: false, crossEnv: false })).toBe(true);
    expect(otherEnv("custom")).toBe("production");
  });
});
