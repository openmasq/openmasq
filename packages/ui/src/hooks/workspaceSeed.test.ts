import { describe, it, expect } from "vitest";
import { shouldSeedActiveTab, sendTargetConvId } from "./workspaceSeed";

describe("shouldSeedActiveTab", () => {
  it("seeds an activeId that was set from OUTSIDE the layout (an account load)", () => {
    // Why the seed exists at all: the account restored `activeId` before any tab existed.
    // It was never open, so nothing closed it — give it a tab or the shell shows nothing.
    expect(
      shouldSeedActiveTab({ activeId: "c1", openTabIds: [], prevOpenTabIds: [] }),
    ).toBe(true);
  });

  it("does NOT re-open the active tab the user just CLOSED", () => {
    // THE REGRESSION. `c1` was open a beat ago and is gone now → the user closed it. The
    // store's activeId still says "c1" only because the layout→activeId mirror has not run
    // yet. Seeding here put the tab straight back: with one tab (always the active one)
    // the close button did nothing at all.
    expect(
      shouldSeedActiveTab({ activeId: "c1", openTabIds: [], prevOpenTabIds: ["c1"] }),
    ).toBe(false);
  });

  it("does NOT re-open a closed ACTIVE tab when other tabs remain", () => {
    // Same bug, less visible: closing the active tab of several also resurrected it.
    expect(
      shouldSeedActiveTab({ activeId: "c1", openTabIds: ["c2"], prevOpenTabIds: ["c1", "c2"] }),
    ).toBe(false);
  });

  it("does nothing when the activeId already has a tab (the steady state)", () => {
    expect(
      shouldSeedActiveTab({ activeId: "c1", openTabIds: ["c1"], prevOpenTabIds: ["c1"] }),
    ).toBe(false);
  });

  it("does nothing with no active conversation", () => {
    expect(
      shouldSeedActiveTab({ activeId: null, openTabIds: [], prevOpenTabIds: ["c1"] }),
    ).toBe(false);
  });

  it("still seeds when the activeId SWITCHES to a conversation that was never open", () => {
    // A closed tab must not come back, but an activeId pointing somewhere genuinely new
    // (opened from the sidebar / search) must still get a tab — the guard is about the
    // id we just removed, not about any absence.
    expect(
      shouldSeedActiveTab({ activeId: "c9", openTabIds: ["c2"], prevOpenTabIds: ["c1", "c2"] }),
    ).toBe(true);
  });
});

describe("sendTargetConvId", () => {
  it("reuses the pane's active conversation when it is LIVE", () => {
    expect(sendTargetConvId("c1", true)).toBe("c1");
  });

  it("returns null with no tab open (welcome screen) → caller mints a fresh one", () => {
    expect(sendTargetConvId(null, false)).toBe(null);
  });

  it("returns null for a GHOST ref — a tab pointing at an absent conversation", () => {
    // THE REGRESSION. The pane's active tab is "ghost", but no such conversation exists in
    // the store (prune skipped while the account has zero loaded conversations; the seed
    // skipped a non-null active ref). Reusing it sent into an id `patchConversation` never
    // matched — the message vanished silently ("clic sur un starter : rien ne se passe").
    // Falling back to null routes it through the create-a-fresh-conversation path.
    expect(sendTargetConvId("ghost", false)).toBe(null);
  });
});
