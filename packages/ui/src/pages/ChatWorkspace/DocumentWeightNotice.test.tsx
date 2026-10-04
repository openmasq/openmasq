// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { mount } from "../../testKit";
import type { Message } from "../../types";
import { DocumentWeightNotice } from "./DocumentWeightNotice";

// gpt-4o: 128K tokens ≈ 512K chars at chars/4.
const turn = (docChars: number): Message =>
  ({ id: "u1", role: "user", content: "q", attachments: [{ name: "a.pdf", kind: "pdf" }], modelContent: "q" + "x".repeat(docChars) }) as Message;

describe("DocumentWeightNotice — what the documents cost, above the composer", () => {
  it("says the share and how to make room; past the window, that the oldest stop", async () => {
    const m = await mount(<DocumentWeightNotice messages={[turn(410_000)]} modelId="gpt-4o" modelLabel="GPT-4o" />);
    expect(m.el.textContent).toContain("occupent environ 80 % de la fenêtre de GPT-4o");
    expect(m.el.textContent).toContain("nouvelle conversation");
    await m.rerender(<DocumentWeightNotice messages={[turn(600_000)]} modelId="gpt-4o" modelLabel="GPT-4o" />);
    expect(m.el.textContent).toContain("dépassent la fenêtre de GPT-4o");
    await m.unmount();
  });

  it("stays silent below half the window and in Auto mode", async () => {
    const m = await mount(<DocumentWeightNotice messages={[turn(100_000)]} modelId="gpt-4o" modelLabel="GPT-4o" />);
    expect(m.el.textContent).toBe("");
    await m.rerender(<DocumentWeightNotice messages={[turn(600_000)]} modelId={undefined} modelLabel="Auto" />);
    expect(m.el.textContent).toBe("");
    await m.unmount();
  });
});
