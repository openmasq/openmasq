import { describe, it, expect } from "vitest";
import { versionsView, isStagingBuild } from "./versionsView";
import type { UpdateStatus } from "../../../../host";

const prod = { channel: "desktop-production" };
const stag = { channel: "desktop-staging" };
const st = (state: UpdateStatus["state"]): UpdateStatus => ({ state });

describe("page Versions — ce qu'on montre, et à qui", () => {
  it("dit simplement « à jour » sur une build de production au repos", () => {
    expect(versionsView(null, { current: prod })).toEqual({ kind: "upToDate" });
    expect(versionsView(st("not-available"), { current: prod })).toEqual({ kind: "upToDate" });
  });

  it("⚠️ ne dit PAS « à jour » pendant que l'updater travaille — ni s'il a échoué", () => {
    // « à jour » est une affirmation. Elle rassurerait pendant un téléchargement, et
    // mentirait après une erreur.
    for (const s of ["checking", "available", "downloading", "downloaded", "error"] as const)
      expect(versionsView(st(s), { current: prod }), s).toEqual({ kind: "busy" });
  });

  it("garde tout le détail technique sur une build de staging", () => {
    expect(versionsView(null, { current: stag })).toEqual({ kind: "technical" });
    expect(versionsView(st("downloading"), { current: stag })).toEqual({ kind: "technical" });
  });

  it("garde le détail pour un appareil privilégié (il peut épingler et basculer)", () => {
    expect(versionsView(null, { current: prod, privileged: true })).toEqual({ kind: "technical" });
  });

  it("l'environnement PUBLIÉ tranche avant le nom du canal", () => {
    // Un canal nommé sans « staging » mais publié en staging reste technique.
    expect(isStagingBuild({ channel: "desktop-canary" }, [{ channel: "desktop-canary", env: "staging" }])).toBe(true);
    // …et l'inverse : un nom trompeur ne suffit pas si l'env publié dit production.
    expect(isStagingBuild({ channel: "desktop-beta" }, [{ channel: "desktop-beta", env: "production" }])).toBe(false);
  });

  it("sans canal connu, on ne DEVINE pas un staging — la production est le défaut", () => {
    expect(isStagingBuild(null)).toBe(false);
    expect(isStagingBuild({})).toBe(false);
  });
});
