import { describe, it, expect } from "vitest";
import { isFreeMode, FREE_MODE_ENV } from "./freeMode.js";

describe("isFreeMode — l'interrupteur du mode gratuit", () => {
  it("n'allume QUE sur la valeur exacte « 1 » — fail-closed sur le sens qui ouvre", () => {
    expect(isFreeMode({ [FREE_MODE_ENV]: "1" })).toBe(true);
    for (const off of ["", "0", "true", "yes", " 1", "1 ", undefined]) {
      expect(isFreeMode({ [FREE_MODE_ENV]: off }), `valeur ${JSON.stringify(off)}`).toBe(false);
    }
    expect(isFreeMode({})).toBe(false);
  });

  it("lit l'environnement qu'on lui donne, jamais une valeur figée", () => {
    const env: Record<string, string | undefined> = {};
    expect(isFreeMode(env)).toBe(false);
    env[FREE_MODE_ENV] = "1";
    expect(isFreeMode(env)).toBe(true);
    delete env[FREE_MODE_ENV];
    expect(isFreeMode(env)).toBe(false);
  });
});
