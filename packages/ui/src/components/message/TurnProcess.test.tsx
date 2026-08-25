// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "../../testKit";
import { TurnProcess } from "./TurnProcess";
import type { Message } from "../../types";

const msg = (m: Partial<Message>): Message =>
  ({ id: "m1", role: "assistant", content: "", ...m }) as Message;

describe("TurnProcess", () => {
  it("keeps the reflection COLLAPSED once the answer exists — the answer is what was asked for", async () => {
    const m = await mount(
      <TurnProcess message={msg({ content: "Voici le total.", reasoning: "J'additionne les soldes…" })} />,
    );
    expect(m.find(".om-reflect-toggle").textContent).toContain("Réflexion");
    expect(m.maybe(".om-reflect-body")).toBeNull();
    await m.click(".om-reflect-toggle");
    expect(m.find(".om-reflect-body").textContent).toBe("J'additionne les soldes…");
    await m.unmount();
  });

  it("stands down while the LOADER owns the bubble (the same text in two places)", async () => {
    // pending + no content + no tool call = `assistantBody === "thinking"`, i.e. the
    // ThinkingIndicator is already showing this reflection live.
    const m = await mount(<TurnProcess message={msg({ pending: true, reasoning: "…" })} />);
    expect(m.maybe(".om-reflect")).toBeNull();
    await m.unmount();
  });

  it("shows it again as soon as a tool call takes the bubble over", async () => {
    const m = await mount(
      <TurnProcess message={msg({ pending: true, toolCall: "stripe__stripe_api_read", reasoning: "…" })} />,
    );
    expect(m.maybe(".om-reflect")).not.toBeNull();
    await m.unmount();
  });

  it("survives the turn: a settled message still carries its reflection", async () => {
    const m = await mount(<TurnProcess message={msg({ content: "Fait.", reasoning: "Mon plan…" })} />);
    expect(m.maybe(".om-reflect")).not.toBeNull();
    await m.unmount();
  });

  it("renders nothing at all for a turn with neither reflection nor tools", async () => {
    const m = await mount(<TurnProcess message={msg({ content: "Bonjour." })} />);
    expect(m.maybe(".om-reflect")).toBeNull();
    expect(m.maybe(".mcp-trace")).toBeNull();
    await m.unmount();
  });

  it("a whitespace-only reflection is no reflection (never an empty grey aside)", async () => {
    const m = await mount(<TurnProcess message={msg({ content: "ok", reasoning: "  \n " })} />);
    expect(m.maybe(".om-reflect")).toBeNull();
    await m.unmount();
  });
});
