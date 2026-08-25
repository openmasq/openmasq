import { describe, it, expect } from "vitest";
import { appendReusedDocsWire } from "./reusedDocsWire";

describe("appendReusedDocsWire", () => {
  it("returns the wire unchanged (same ref) when there are no reused docs", () => {
    const wire = { text: "hello", matches: [] as unknown[] };
    expect(appendReusedDocsWire(wire, [], {}, undefined)).toBe(wire);
  });

  it("appends the reused doc header + vault-applied text and adds a match per valid rep", () => {
    // vault is fake→real; applyVault swaps the REAL value in the doc text for its fake.
    const vault = { FAKE1: "Marc Savary" };
    const wire = { text: "compare", matches: [] as unknown[] };
    const out = appendReusedDocsWire(
      wire,
      [
        {
          header: "\n=== doc ===\n",
          reps: [{ real: "Marc Savary", fake: "FAKE1", tone: "violet" }],
          text: "Marc Savary habite Lyon",
        },
      ],
      vault,
      undefined,
    );
    // The reused doc's REAL value is redacted to its fake in the appended wire.
    expect(out.text).toBe("compare\n=== doc ===\nFAKE1 habite Lyon");
    expect(out.text).not.toContain("Marc Savary");
    // The rep is recorded as a preview/audit match (violet tone → "name" category).
    expect(out.matches).toEqual([
      { type: "name", category: "name", value: "Marc Savary", placeholder: "FAKE1" },
    ]);
  });

  it("skips a rep missing its fake or its real value", () => {
    const out = appendReusedDocsWire(
      { text: "", matches: [] },
      [{ header: "H", reps: [{ real: "", fake: "F" }, { real: "R", fake: "" }], text: "" }],
      {},
      undefined,
    );
    expect(out.matches).toEqual([]);
  });

  it("an unknown / missing tone maps to the 'secret' category (fail-safe)", () => {
    const out = appendReusedDocsWire(
      { text: "", matches: [] },
      [{ header: "H", reps: [{ real: "R", fake: "F" }], text: "" }],
      {},
      undefined,
    );
    expect(out.matches).toEqual([{ type: "secret", category: "secret", value: "R", placeholder: "F" }]);
  });

  it("preserves an existing modelError + prior matches when appending", () => {
    const out = appendReusedDocsWire(
      { text: "x", matches: [{ a: 1 }], modelError: "boom" },
      [{ header: "\nH\n", reps: [{ real: "R", fake: "F", tone: "blue" }], text: "R" }],
      { F: "R" },
      undefined,
    );
    expect(out.modelError).toBe("boom");
    expect(out.matches[0]).toEqual({ a: 1 });
    expect(out.matches[1]).toMatchObject({ category: "email", value: "R", placeholder: "F" });
  });
});
