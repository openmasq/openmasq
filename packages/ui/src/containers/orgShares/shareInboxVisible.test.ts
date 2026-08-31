import { describe, expect, it } from "vitest";
import { shareInboxVisible } from "./useOrgShares";

describe("shareInboxVisible — la cloche « Demandes » n'existe que si elle peut sonner", () => {
  it("⛔ jamais sans le créneau host.orgShares (build sans backend)", () => {
    expect(shareInboxVisible({ available: false, inOrg: true, shareCount: 3 })).toBe(false);
  });

  it("jamais pour un compte solo sans aucun partage — un bouton qui n'annoncera rien", () => {
    expect(shareInboxVisible({ available: true, inOrg: false, shareCount: 0 })).toBe(false);
  });

  it("rendue pour un membre d'organisation, même sans demande en attente", () => {
    expect(shareInboxVisible({ available: true, inOrg: true, shareCount: 0 })).toBe(true);
  });

  it("rendue hors organisation quand des partages existent encore — ils restent décidables/révocables", () => {
    expect(shareInboxVisible({ available: true, inOrg: false, shareCount: 1 })).toBe(true);
  });
});
