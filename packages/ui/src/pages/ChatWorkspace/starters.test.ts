import { describe, it, expect } from "vitest";
import { redact } from "@openmasq/redact";
import { getMessages } from "@openmasq/i18n";
import { findConnector } from "@openmasq/catalog/mcp";
import { pickStarters, starterCopy, INTEGRATION_STARTERS, UNIVERSAL_STARTERS } from "./starters";

describe("pickStarters — rien à connecter depuis l'accueil, jamais", () => {
  it("install fraîche : les quatre amorces universelles, AUCUNE carte d'intégration", () => {
    // The home screen once offered Gmail, Drive, Agenda… a new user could not use.
    const { universal, integrations } = pickStarters([]);
    expect(universal.map((s) => s.id)).toEqual(UNIVERSAL_STARTERS.map((s) => s.id));
    expect(integrations).toEqual([]);
  });

  it("Slack, Notion, OneDrive/Dropbox CONNECTÉS : une carte chacun, qui nomme le service", () => {
    const { integrations } = pickStarters(["slack", "notion", "dropbox"]);
    expect(integrations).toEqual([
      { id: "chat-catchup", connectorId: "slack" },
      { id: "notes-find", connectorId: "notion" },
      { id: "files-find", connectorId: "dropbox" },
    ]);
    const t = getMessages("fr");
    expect(starterCopy(integrations[2], t, "OneDrive").prompt).toContain("OneDrive");
  });

  it("un service non listé ne fait apparaître aucune carte (Gmail, Drive…)", () => {
    expect(pickStarters(["gmail", "google-drive", "github"]).integrations).toEqual([]);
  });

  it("chaque amorce d'intégration nomme des connecteurs RÉELS du catalogue", () => {
    for (const s of INTEGRATION_STARTERS)
      for (const id of s.connectors) expect(findConnector(id), id).toBeTruthy();
  });

  it("Mémoire fermée : l'amorce « Retiens que… » disparaît", () => {
    expect(pickStarters([], { memoryOpen: false }).universal.map((s) => s.id)).not.toContain("memory");
  });

  it("des ids stables et uniques (clés React et table d'icônes)", () => {
    const ids = [...UNIVERSAL_STARTERS, ...INTEGRATION_STARTERS].map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("amorces universelles — elles MONTRENT le masquage", () => {
  // Their whole point: the card sends data the engine masks before it leaves. A demo
  // whose IBAN fails its checksum, or whose e-mail no longer parses, would show nothing.
  for (const locale of ["fr", "en"] as const) {
    it(`${locale} : chaque démonstrateur porte des données que le moteur déterministe masque`, () => {
      const t = getMessages(locale);
      for (const s of UNIVERSAL_STARTERS.filter((s) => s.id !== "memory")) {
        const types = redact(starterCopy(s, t).prompt).matches.map((m) => m.type);
        expect(types.length, `${locale}/${s.id}`).toBeGreaterThan(0);
      }
    });
  }
});
