import { describe, expect, it } from "vitest";
import type { Message } from "../types";
import { buildWireHistory } from "./buildWire";
import { compactableTurns } from "./contextSummary";
import { wasRedacted } from "./replayable";

// A user turn whose redaction never completed — refused because detection failed, or stopped
// before the pass finished — keeps its REAL text in the conversation. Its values never
// reached the vault, so a replay would send them as typed. It never goes back out.
const REAL = "Kwame Adjei-Boateng, dossier diabète, 06 12 34 56 78";
const failedTurn = { id: "u0", role: "user", content: REAL } as Message; // no `redactions`
const errored = { id: "a0", role: "assistant", content: "", error: true } as Message;
const sent = { id: "u1", role: "user", content: "Bonjour", redactions: 0 } as Message;
const reply = { id: "a1", role: "assistant", content: "Bonjour !" } as Message;
const identity = (s: string) => ({ text: s });

describe("a user turn whose redaction never completed", () => {
  it("is not replayed in the history of the next send", () => {
    const wire = buildWireHistory([failedTurn, errored, sent, reply], { text: "réessaie" }, "", undefined, identity);
    expect(JSON.stringify(wire)).not.toContain("Kwame");
    expect(wire.map((m) => m.content)).toContain("Bonjour");
  });

  it("is not handed to the context summary", () => {
    const turns = compactableTurns([failedTurn, sent, reply] as never);
    expect(JSON.stringify(turns)).not.toContain("Kwame");
    expect(turns).toHaveLength(2);
  });

  it("is recognised by its missing redaction count — the model's own turns always pass", () => {
    expect(wasRedacted(failedTurn)).toBe(false);
    expect(wasRedacted(sent)).toBe(true);
    expect(wasRedacted(errored)).toBe(true);
  });
});
