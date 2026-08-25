import { describe, expect, it } from "vitest";
import { assignDisplayTokens, replacementDisplayTokens, vaultDisplayTokens } from "./tokens";

describe("display tokens — [PERSON1]/[IBAN] rendering vocabulary", () => {
  it("numbers a category with several values, keeps a single one bare", () => {
    const m = vaultDisplayTokens(
      { "Nadia Vannec": "Louis Terral", "Paul Cayre": "Anna Vayre", "FRXX…": "FR7630006000011234567890189" },
      { "Louis Terral": "name", "Anna Vayre": "name", FR7630006000011234567890189: "iban" },
    );
    expect(m.get("Louis Terral")).toBe("[PERSON1]");
    expect(m.get("Anna Vayre")).toBe("[PERSON2]");
    expect(m.get("FR7630006000011234567890189")).toBe("[IBAN]");
  });

  it("a value's token is STABLE for a given vault order (same value, same token everywhere)", () => {
    const vault = { a: "Louis Terral", b: "Anna Vayre" };
    const kinds = { "Louis Terral": "name", "Anna Vayre": "name" };
    expect(vaultDisplayTokens(vault, kinds).get("Anna Vayre")).toBe(
      vaultDisplayTokens(vault, kinds).get("Anna Vayre"),
    );
  });

  it("types via the placeholder marker when no kinds entry exists ([REDACTED_EMAIL_1] → EMAIL)", () => {
    const m = vaultDisplayTokens({ "[REDACTED_EMAIL_1]": "jean@exemple.fr" });
    expect(m.get("jean@exemple.fr")).toBe("[EMAIL]");
  });

  it("types via the value's SHAPE when the fake is a believable fake (fake-data engine)", () => {
    const m = vaultDisplayTokens({ "paul@voxa.com": "jean@exemple.fr" });
    expect(m.get("jean@exemple.fr")).toBe("[EMAIL]");
  });

  it("shapeless free text falls back to [INFO], never [SECRET]", () => {
    const m = assignDisplayTokens([{ value: "quelque chose d'opaque" }]);
    expect(m.get("quelque chose d'opaque")).toBe("[INFO]");
  });

  it("replacement lists key on the REAL value, in list order", () => {
    const m = replacementDisplayTokens([
      { real: "Louis Terral", fake: "Nadia Vannec", kind: "name" },
      { real: "Marc Neira", fake: "Paul Cayre", kind: "name" },
    ]);
    expect(m.get("Louis Terral")).toBe("[PERSON1]");
    expect(m.get("Marc Neira")).toBe("[PERSON2]");
  });

  it("duplicate spans of the same value share one token (no double numbering)", () => {
    const m = assignDisplayTokens([
      { value: "Louis Terral", kind: "name" },
      { value: "Louis Terral", kind: "name" },
      { value: "Anna Vayre", kind: "name" },
    ]);
    expect(m.get("Louis Terral")).toBe("[PERSON1]");
    expect(m.get("Anna Vayre")).toBe("[PERSON2]");
  });
});
