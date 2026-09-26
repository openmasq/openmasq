import { describe, expect, it } from "vitest";
import { mergeVault } from "./mergeVault";

describe("mergeVault", () => {
  it("keeps what was vaulted while the file was being redacted", () => {
    const snapshot = { "Eudes Quémener": "Jean Dupont" };
    const now = { ...snapshot, "Kelby Group": "Atelier Sud" }; // a tool result, meanwhile
    const fromFile = { ...snapshot, "Nerivo Consulting": "Projet Héliotrope" };
    expect(mergeVault(now, fromFile)).toEqual({
      "Eudes Quémener": "Jean Dupont",
      "Kelby Group": "Atelier Sud",
      "Nerivo Consulting": "Projet Héliotrope",
    });
  });
});
