import { describe, it, expect } from "vitest";
import { updateBusy } from "./useUpdateQuiescence";

const convs = [{ id: "a" }, { id: "b" }];

describe("updateBusy — ce qui interdit une auto-installation (fail-closed côté UI)", () => {
  it("un envoi en vol ⇒ occupé (couvre les tours agentiques et run_python)", () => {
    expect(updateBusy({ isStreaming: true, conversations: [], getDraft: () => "" })).toBe(true);
  });

  it("un brouillon non vide N'IMPORTE OÙ ⇒ occupé — mémoire seulement, un restart le détruit", () => {
    const drafts: Record<string, string> = { b: "à moitié tapé…" };
    expect(
      updateBusy({ isStreaming: false, conversations: convs, getDraft: (id) => drafts[id] ?? "" }),
    ).toBe(true);
  });

  it("rien en vol, brouillons vides ou blancs ⇒ libre", () => {
    expect(
      updateBusy({ isStreaming: false, conversations: convs, getDraft: () => "   " }),
    ).toBe(false);
    expect(updateBusy({ isStreaming: false, conversations: [], getDraft: () => "" })).toBe(false);
  });
});
