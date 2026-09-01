import { getMessages } from "@openmasq/i18n";
import { describe, it, expect } from "vitest";
import { slashQuery, slashMatches, clampSlashIndex, slashActionMatches } from "./slashPalette";
import type { Skill } from "../../types";

const c = (name: string, desc?: string): Skill => ({
  id: name,
  name,
  prompt: "p",
  desc,
  cat: "redaction",
  pinned: false,
  uses: 0,
  createdAt: 0,
});

const fr = getMessages("fr");

describe("slashQuery — when the palette is open", () => {
  it("opens on a bare '/' with an empty query", () => {
    expect(slashQuery("/")).toBe("");
  });
  it("carries the text after the slash as the query", () => {
    expect(slashQuery("/mail")).toBe("mail");
  });
  it("stays closed for ordinary text, including a mid-text slash", () => {
    expect(slashQuery("")).toBeNull();
    expect(slashQuery("bonjour")).toBeNull();
    expect(slashQuery("un ratio a/b")).toBeNull();
  });
  it("closes once a newline lands — the user is composing, Enter must send", () => {
    expect(slashQuery("/mail\nsuite")).toBeNull();
  });
  it("closes on an over-long draft (a sentence, not a lookup)", () => {
    expect(slashQuery("/" + "x".repeat(65))).toBeNull();
    expect(slashQuery("/" + "x".repeat(64))).not.toBeNull();
  });
});

describe("slashMatches — same filter as the Compétences page", () => {
  const list = [c("Réponse e-mail", "réponse pro"), c("Synthèse"), c("Traduction", "en anglais")];
  it("empty query keeps everything", () => {
    expect(slashMatches(list, "").map((x) => x.name)).toEqual(["Réponse e-mail", "Synthèse", "Traduction"]);
  });
  it("matches on name OR desc, case-insensitive", () => {
    expect(slashMatches(list, "MAIL").map((x) => x.name)).toEqual(["Réponse e-mail"]);
    expect(slashMatches(list, "anglais").map((x) => x.name)).toEqual(["Traduction"]);
  });
  it("no match → empty list (Enter then falls through to a normal send)", () => {
    expect(slashMatches(list, "zzz")).toEqual([]);
  });
});

describe("clampSlashIndex", () => {
  it("clamps into the narrowed list and floors at 0", () => {
    expect(clampSlashIndex(4, 2)).toBe(1);
    expect(clampSlashIndex(-1, 2)).toBe(0);
    expect(clampSlashIndex(0, 0)).toBe(0);
  });
});

describe("slashActionMatches — the built-in « /retenir » action", () => {
  it("lists on the bare '/', on an id prefix and on a label word", () => {
    for (const q of ["", "r", "reten", "mémoire"]) {
      expect(slashActionMatches(q, fr).map((a) => a.id), q).toEqual(["retenir"]);
    }
  });
  it("stays out of unrelated lookups", () => {
    expect(slashActionMatches("traduction", fr)).toEqual([]);
  });
  it("its insert seeds the explicit-ask phrasing the extraction recognises", async () => {
    const { isExplicitMemoryAsk } = await import("../../memory/extract");
    for (const a of slashActionMatches("", fr)) {
      expect(isExplicitMemoryAsk(a.insert + "je préfère le train"), a.id).toBe(true);
    }
  });
});
