// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { mount } from "../../../testKit";
import type { Conversation } from "../../../types";
import { TransparencyModal } from "./TransparencyModal";
import { FIRST_CHARS, STEP_CHARS } from "./sliceSegments";

const conv = (content: string): Conversation =>
  ({
    id: "c",
    title: "",
    messages: [{ id: "m1", role: "user", content }],
    redactionVault: { "[PERSON1]": "Jean Dupont" },
    redactionKinds: { "Jean Dupont": "person" },
  }) as unknown as Conversation;

describe("TransparencyModal — a long text mounts in steps", () => {
  it("shows the start of a 200k-char message, then more on demand, never all at once", async () => {
    const line = "Le client Jean Dupont a signé. Clause lorem ipsum dolor sit amet.\n";
    const text = line.repeat(Math.ceil(200_000 / line.length));
    const m = await mount(<TransparencyModal conversation={conv(text)} onClose={() => {}} />);
    const [real, wire] = m.findAll(".tsp-text").map((el) => el.textContent ?? "");
    expect(real.length).toBeLessThanOrEqual(FIRST_CHARS + "Jean Dupont".length);
    expect(text.startsWith(real)).toBe(true);
    expect(wire.startsWith("Le client [PERSON1] a signé.")).toBe(true);
    const more = m.find<HTMLButtonElement>("button.tsp-more");
    expect(more.textContent).toMatch(/Afficher la suite/);
    await m.click(more);
    const after = m.findAll(".tsp-text")[0].textContent ?? "";
    expect(after.length).toBeGreaterThan(FIRST_CHARS + STEP_CHARS - 100);
    expect(text.startsWith(after)).toBe(true);
    await m.unmount();
  });

  it("a short text shows whole, with no « show more »", async () => {
    const m = await mount(<TransparencyModal conversation={conv("Bonjour Jean Dupont.")} onClose={() => {}} />);
    expect(m.findAll(".tsp-text")[0].textContent).toBe("Bonjour Jean Dupont.");
    expect(m.maybe("button.tsp-more")).toBeNull();
    await m.unmount();
  });
});
