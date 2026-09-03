import { BRAND } from "@openmasq/branding";
import { describe, it, expect } from "vitest";
import { barFor, memoryExportFilename, memoryExportText } from "./memoryExport";
import { CLUSTER_MIN_SIM, PERSON_PAIR_MIN_SIM } from "./cluster";
import type { MemoryCard, MemoryData } from "../types";

const NOW = new Date("2026-07-26T10:00:00.000Z");
const card = (over: Partial<MemoryCard> = {}): MemoryCard =>
  ({
    id: "c1",
    entity: "Karl Studio",
    cat: "organisation",
    facts: "Agence de design.",
    createdAt: Date.UTC(2026, 0, 2),
    updatedAt: Date.UTC(2026, 0, 3),
    ...over,
  }) as MemoryCard;
const data = (over: Partial<MemoryData> = {}): MemoryData => ({ cards: [card()], ...over });

describe("memoryExportText — the links, with the bars that decide them", () => {
  it("prints every card with its identity, provenance and dates", () => {
    const out = memoryExportText({
      memoryData: data({ cards: [card({ aliases: ["Karl"], source: "auto" })] }),
      now: NOW,
    });
    expect(out).toContain("Karl Studio");
    expect(out).toContain("organisation");
    expect(out).toContain("auto");
    expect(out).toContain("2026-01-02");
  });

  it("marks a semantic link KEPT or below the bar — and the bar is higher between people", () => {
    // The measured case: two people at 0.93 are BELOW the person-pair bar, while the same
    // score between a person and an org clears the cluster bar. Reading the raw number
    // without its bar told the opposite story.
    const p1 = card({ id: "p1", entity: "Florian", cat: "personne" });
    const p2 = card({ id: "p2", entity: "Valentine", cat: "personne" });
    const org = card({ id: "o1", entity: "Orvalis", cat: "projet" });
    const out = memoryExportText({
      memoryData: { cards: [p1, p2, org] },
      edges: [
        { a: "p1", b: "p2", sim: 0.93 }, // person↔person → 0.95 bar → ✗
        { a: "p1", b: "o1", sim: 0.93 }, // person↔project → 0.92 bar → ✓
      ],
      now: NOW,
    });
    expect(out).toMatch(/0\.9300 ✗ {2}Valentine.*seuil 0\.95/);
    expect(out).toMatch(/0\.9300 ✓ {2}Orvalis.*seuil 0\.92/);
    expect(barFor(p1, p2)).toBe(PERSON_PAIR_MIN_SIM);
    expect(barFor(p1, org)).toBe(CLUSTER_MIN_SIM);
  });

  it("counts raw edges AND the ones the graph keeps — they are not the same number", () => {
    const p1 = card({ id: "p1", entity: "A", cat: "personne" });
    const p2 = card({ id: "p2", entity: "B", cat: "personne" });
    const p3 = card({ id: "p3", entity: "C", cat: "personne" });
    const out = memoryExportText({
      memoryData: { cards: [p1, p2, p3] },
      edges: [
        { a: "p1", b: "p2", sim: 0.96 },
        { a: "p2", b: "p3", sim: 0.93 },
      ],
      now: NOW,
    });
    expect(out).toContain("2 bruts · 1 retenus par le graphe");
  });

  it("includes the MENTION links — the half a semantic-only export was missing", () => {
    // Laura's facts name Orvalis: the graph draws that edge, and its absence from the first
    // export read as « Laura is not connected to Orvalis », which was false.
    const laura = card({ id: "l", entity: "Laura", cat: "personne", facts: "Go-to-market pour l'équipe de Orvalis." });
    const orvalis = card({ id: "v", entity: "Orvalis", cat: "projet", facts: "Services numériques." });
    const out = memoryExportText({ memoryData: { cards: [laura, orvalis] }, edges: [], now: NOW });
    expect(out).toContain("Liens mention   1");
    expect(out).toMatch(/mention {3}Orvalis/);
    expect(out).toMatch(/mention {3}Laura/); // both directions, under each card
  });

  it("groups the links UNDER their card, and keeps the flat strongest-first view too", () => {
    const a = card({ id: "a", entity: "Alice", cat: "personne" });
    const b = card({ id: "b", entity: "Bob", cat: "personne" });
    const out = memoryExportText({
      memoryData: { cards: [a, b] },
      edges: [{ a: "a", b: "b", sim: 0.97 }],
      now: NOW,
    });
    expect(out).toContain("FICHES ET LEURS LIENS");
    expect(out).toContain("TOUS LES LIENS SÉMANTIQUES");
    // Alice's block names Bob before the flat section starts.
    const perCard = out.slice(out.indexOf("[1] Alice"), out.indexOf("TOUS LES LIENS"));
    expect(perCard).toContain("Bob");
  });

  it("a card with no link says so instead of looking truncated", () => {
    const out = memoryExportText({ memoryData: data(), edges: [], now: NOW });
    expect(out).toContain("liens     (aucun)");
  });

  it("shows a DANGLING edge rather than hiding it (that's a bug worth seeing)", () => {
    const out = memoryExportText({
      memoryData: { cards: [card({ id: "a", entity: "Alice" })] },
      edges: [{ a: "a", b: "ghost", sim: 0.99 }],
      now: NOW,
    });
    expect(out).toContain("? ghost");
  });

  it("distinguishes « no index » from « no links »", () => {
    expect(memoryExportText({ memoryData: data(), now: NOW })).toContain("index sémantique absent");
    const empty = memoryExportText({ memoryData: data(), edges: [], now: NOW });
    expect(empty).toContain("0 bruts");
    expect(empty).not.toContain("index sémantique absent");
  });

  it("carries the three thresholds, and warns that it holds REAL data", () => {
    const out = memoryExportText({ memoryData: data(), edges: [], now: NOW });
    expect(out).toContain("cluster 0.92");
    expect(out).toContain("paire de personnes 0.95");
    expect(out).toContain("doublon 0.95");
    expect(out).toMatch(/RÉELLES.*non redacted/s);
  });

  it("handles an empty memory without pretending it has content", () => {
    const out = memoryExportText({ memoryData: { cards: [] }, edges: [], now: NOW });
    expect(out).toContain("(aucune fiche)");
    expect(out).toContain("(aucun profil enregistré)");
  });

  it("names the file by date, so two exports never collide", () => {
    expect(memoryExportFilename(NOW)).toBe(`${BRAND.slug}-memoire-2026-07-26.txt`);
  });
});
