// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "../../testKit";
import { ThinkingIndicator } from "./ThinkingIndicator";

describe("ThinkingIndicator", () => {
  it("shows the loader ALONE when the model publishes no reflection", async () => {
    const m = await mount(<ThinkingIndicator />);
    expect(m.maybe(".om-think-reflection")).toBeNull(); // nothing invented in its place
    expect(m.find(".om-think").getAttribute("aria-label")).toBe("Le modèle prépare la réponse");
    await m.unmount();
  });

  it("shows the reflection when there is one, and keeps it out of the live region", async () => {
    const m = await mount(<ThinkingIndicator reasoning="Je pèse les deux options…" />);
    const box = m.find(".om-think-reflection");
    expect(box.textContent).toBe("Je pèse les deux options…");
    // `role="status"` announces the WAIT once; text rewritten every ~90 ms must not be
    // read out as it is drafted.
    expect(box.getAttribute("aria-hidden")).toBe("true");
    expect(m.find(".om-think").className).toContain("is-reflecting");
    await m.unmount();
  });

  it("a whitespace-only reflection is no reflection (never an empty grey box)", async () => {
    const m = await mount(<ThinkingIndicator reasoning={"   \n  "} />);
    expect(m.maybe(".om-think-reflection")).toBeNull();
    await m.unmount();
  });

  it("drops the reflection when the turn clears it", async () => {
    const m = await mount(<ThinkingIndicator reasoning="…" />);
    await m.rerender(<ThinkingIndicator />);
    expect(m.maybe(".om-think-reflection")).toBeNull();
    expect(m.find(".om-think").className).not.toContain("is-reflecting");
    await m.unmount();
  });
});
