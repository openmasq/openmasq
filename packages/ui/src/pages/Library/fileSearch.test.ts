import { describe, expect, it } from "vitest";
import { searchFiles } from "./fileSearch";
import type { LibFile } from "./libFile";

const file = (id: string, name: string, conversationTitle = ""): LibFile => ({
  id,
  name,
  mime: "application/pdf",
  redacted: false,
  createdAt: 0,
  conversationId: "c",
  conversationTitle,
  kind: "document",
});

const FILES = [
  file("1", "Résumé Marie.pdf", "Candidature"),
  file("2", "budget-2026.xlsx", "Compta"),
  file("3", "photo.png", "Vacances à Nice"),
];

describe("searchFiles", () => {
  it("empty query → no rows (palette stays conversation-first)", () => {
    expect(searchFiles(FILES, "")).toEqual([]);
    expect(searchFiles(FILES, "   ")).toEqual([]);
  });

  it("matches on file name, accent-insensitively", () => {
    expect(searchFiles(FILES, "resume").map((f) => f.id)).toEqual(["1"]);
    expect(searchFiles(FILES, "BUDGET").map((f) => f.id)).toEqual(["2"]);
  });

  it("also matches on the owning conversation title", () => {
    expect(searchFiles(FILES, "vacances").map((f) => f.id)).toEqual(["3"]);
  });

  it("caps the result count", () => {
    const many = Array.from({ length: 20 }, (_, i) => file(String(i), `note-${i}.txt`));
    expect(searchFiles(many, "note", 5)).toHaveLength(5);
  });
});
