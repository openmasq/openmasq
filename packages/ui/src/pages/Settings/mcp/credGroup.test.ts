import { describe, it, expect } from "vitest";
import { credGroupOf, isSharedCredGroup, groupPeers } from "./credGroup";
import type { McpItem } from "./mcpItems";

/**
 * The invariant: **a Google authorization is ONE, the connectors are SEVEN.** It
 * expires or is revoked all at once, so they fall together — but `mcpReauthDirect`
 * (main) purges only ONE id. Without these cases, you fix Gmail, believe you're done, and
 * Agenda is still broken next time, with nothing having said so (log entry from
 * 11/08/2026: `gmail__search_messages` refused, « Reconnecter » leading only to Gmail).
 */
const item = (id: string, name: string, connected: boolean): McpItem =>
  ({ id, serverId: id, name, desc: "", kind: "direct", connected }) as McpItem;

describe("credGroupOf", () => {
  it("range TOUS les services Google sous une seule autorisation", () => {
    for (const id of [
      "gmail",
      "google-calendar",
      "google-drive",
      "google-docs",
      "google-sheets",
      "google-tasks",
      "google-analytics",
    ]) {
      expect(credGroupOf(id), id).toBe("google");
    }
  });

  it("laisse tout autre connecteur seul dans le sien", () => {
    expect(credGroupOf("slack")).toBe("slack");
    expect(credGroupOf("github")).toBe("github");
    // ⚠️ « googlesomething » is NOT a Google service: the prefix is `google-`.
    expect(credGroupOf("googlebot")).toBe("googlebot");
  });

  it("résout une INSTANCE vers son connecteur (multi-compte)", () => {
    expect(credGroupOf("gmail--a1b2c3")).toBe("google");
    expect(credGroupOf("slack--x9")).toBe("slack");
  });

  it("ne signale un groupe PARTAGÉ que quand il peut en contenir plusieurs", () => {
    expect(isSharedCredGroup("gmail")).toBe(true);
    expect(isSharedCredGroup("slack")).toBe(false);
  });
});

describe("groupPeers — ce que la fiche doit nommer", () => {
  const items = [
    item("gmail", "Gmail", true),
    item("google-calendar", "Google Agenda", true),
    item("google-drive", "Google Drive", false), // known but NOT connected
    item("slack", "Slack", true),
  ];

  it("nomme les autres services Google CONNECTÉS, jamais lui-même", () => {
    expect(groupPeers("gmail", items).map((p) => p.name)).toEqual(["Google Agenda"]);
  });

  it("ne nomme pas un service que l'utilisateur n'a pas connecté", () => {
    // Drive is in the catalogue but disconnected: naming it would turn a
    // repair into a catalogue of what could be connected.
    expect(groupPeers("gmail", items).map((p) => p.id)).not.toContain("google-drive");
  });

  it("ne mélange jamais deux autorisations distinctes", () => {
    expect(groupPeers("slack", items)).toEqual([]);
    expect(groupPeers("gmail", items).map((p) => p.id)).not.toContain("slack");
  });

  it("part d'une INSTANCE comme d'un connecteur (le rappel vient d'un compte)", () => {
    expect(groupPeers("gmail--a1b2c3", items).map((p) => p.name)).toEqual(["Google Agenda"]);
  });

  it("garde l'ordre du catalogue — la phrase ne doit pas changer d'une ouverture à l'autre", () => {
    const many = [
      item("gmail", "Gmail", true),
      item("google-calendar", "Google Agenda", true),
      item("google-drive", "Google Drive", true),
      item("google-docs", "Google Docs", true),
    ];
    expect(groupPeers("gmail", many).map((p) => p.name)).toEqual([
      "Google Agenda",
      "Google Drive",
      "Google Docs",
    ]);
  });
});
