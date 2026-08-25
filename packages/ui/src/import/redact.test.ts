import { describe, it, expect } from "vitest";
import type { Conversation } from "../types";
import { redactImported } from "./redact";

const conv = (contents: string[]): Conversation => ({
  id: "imp-gpt-t",
  title: "t",
  modelId: "m",
  messages: contents.map((content, i) => ({
    id: `imp-gpt-t:m${i}`,
    role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
    content,
  })),
  createdAt: 1,
  updatedAt: 2,
});

describe("redactImported", () => {
  it("builds ONE vault over the whole thread so a continued send replays it (rule 11)", async () => {
    const c = await redactImported(
      conv(["Mon e-mail est jean.rebour@acme.fr", "Je réponds à jean.rebour@acme.fr"]),
      { disabledKinds: [] },
    );
    const vault = c.redactionVault ?? {};
    const reals = Object.values(vault);
    expect(reals).toContain("jean.rebour@acme.fr");
    // One fake per value across turns — repeated value must NOT mint a second entry.
    expect(reals.filter((v) => v === "jean.rebour@acme.fr")).toHaveLength(1);
    expect(c.redactionKinds?.["jean.rebour@acme.fr"]).toBe("email");
    expect(c.redactionSalt).toBeGreaterThan(0);
    // Display content stays REAL — the marks come from the vault, the wire replays it.
    expect(c.messages[0].content).toContain("jean.rebour@acme.fr");
  });

  it("respects disabled categories and returns the conversation untouched when nothing matched", async () => {
    const c = await redactImported(conv(["Contact : jean.rebour@acme.fr"]), {
      disabledKinds: ["email"],
    });
    expect(c.redactionVault).toBeUndefined();
    expect(c.redactionSalt).toBeUndefined();
  });
});
