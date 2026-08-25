import { describe, it, expect } from "vitest";
import { assistantBody, showsTrailingLoader } from "./messageBubbleView";

describe("assistantBody — a pending turn never renders a blank bubble", () => {
  it("shows the loader while prefilling (pending, nothing yet)", () => {
    expect(assistantBody({ pending: true, content: "" })).toBe("thinking");
  });

  it("shows the loader when the model streamed only WHITESPACE around a tool call", () => {
    // The reported bug: a lone "\n"/space is truthy, so the bubble rendered empty
    // Markdown AND suppressed the loader for the whole (22s) tool-call turn.
    expect(assistantBody({ pending: true, content: "\n" })).toBe("thinking");
    expect(assistantBody({ pending: true, content: "   " })).toBe("thinking");
    expect(assistantBody({ pending: true, content: "\n\n " })).toBe("thinking");
  });

  it("renders content as soon as REAL prose arrives (even with leading whitespace)", () => {
    expect(assistantBody({ pending: true, content: "\n\nBonjour" })).toBe("content");
    expect(assistantBody({ pending: false, content: "Réponse finale." })).toBe("content");
  });

  it("yields the main slot to the ToolTrace while a tool is in flight (no loader here)", () => {
    // toolCall / toolCalls set → the ToolTrace card (separate slot) shows the running
    // step, so the main slot is "none" (not a duplicate loader).
    expect(assistantBody({ pending: true, content: "\n", toolCall: "run_python" })).toBe("none");
    expect(
      assistantBody({ pending: true, content: "", toolCalls: [{ tool: "search", server: "mcp", ok: true }] }),
    ).toBe("none");
  });

  it("a settled empty turn renders nothing here (the incomplete/error notices take over)", () => {
    expect(assistantBody({ pending: false, content: "" })).toBe("none");
  });
});

describe("showsTrailingLoader — the loader survives the first token", () => {
  // THE property. `assistantBody` is exclusive, so the first word flipped the main slot
  // from "thinking" to "content" and the loader vanished — while the model kept writing
  // for seconds. From that instant "still coming" and "finished" looked identical.
  it("keeps the loader under prose that is still streaming", () => {
    expect(showsTrailingLoader({ pending: true, content: "Bonjour" })).toBe(true);
    expect(showsTrailingLoader({ pending: true, content: "\n\nBonjour, voici" })).toBe(true);
  });

  it("drops it the moment the turn settles", () => {
    expect(showsTrailingLoader({ pending: false, content: "Réponse finale." })).toBe(false);
  });

  it("never DOUBLES the loader: not while the main slot is already the loader", () => {
    // body === "thinking" renders one itself; a second would be two grids in one bubble.
    expect(assistantBody({ pending: true, content: "" })).toBe("thinking");
    expect(showsTrailingLoader({ pending: true, content: "" })).toBe(false);
    expect(showsTrailingLoader({ pending: true, content: "\n" })).toBe(false);
  });

  it("stays away while a tool holds the turn (the ToolTrace carries the motion)", () => {
    // `isCurrentStep` already animates the trace's last row between two calls
    // (`components/CLAUDE.md`); a loader on top of it would say the same thing twice.
    expect(showsTrailingLoader({ pending: true, content: "\n", toolCall: "run_python" })).toBe(false);
    expect(
      showsTrailingLoader({
        pending: true,
        content: "",
        toolCalls: [{ tool: "search", server: "mcp", ok: true }],
      }),
    ).toBe(false);
  });

  it("a tool call BESIDE real prose still shows it — the turn is alive and writing", () => {
    expect(showsTrailingLoader({ pending: true, content: "Voici ce que j'ai trouvé", toolCall: "search" })).toBe(true);
  });
});
