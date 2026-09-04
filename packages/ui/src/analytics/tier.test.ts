// Pins the split a build packaged outside CI reports through: usage yes, diagnostics no —
// and that the derived set is exactly the map, so nobody maintains two lists.
import { describe, expect, it } from "vitest";
import { ALLOWED } from "./sanitize";
import { EVENT_TIER, USAGE_EVENTS } from "./tier";

describe("EVENT_TIER", () => {
  it("classe CHAQUE événement du vocabulaire — la parité avec l'allow-list le prouve", () => {
    expect(Object.keys(EVENT_TIER).sort()).toEqual(Object.keys(ALLOWED).sort());
  });
  it("l'usage passe, le diagnostic non — les cas qui portent la règle", () => {
    expect(USAGE_EVENTS.has("send_message")).toBe(true);
    expect(USAGE_EVENTS.has("connector_connect")).toBe(true);
    expect(USAGE_EVENTS.has("model_latency")).toBe(false);
    expect(USAGE_EVENTS.has("tool_loop_summary")).toBe(false);
    expect(USAGE_EVENTS.has("$exception")).toBe(false);
  });
  it("USAGE_EVENTS est dérivé de la carte, jamais une seconde liste", () => {
    const fromMap = Object.entries(EVENT_TIER).filter(([, t]) => t === "usage").map(([n]) => n);
    expect([...USAGE_EVENTS].sort()).toEqual(fromMap.sort());
  });
});
