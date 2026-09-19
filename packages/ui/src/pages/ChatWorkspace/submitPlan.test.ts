import { describe, it, expect } from "vitest";
import { planSubmit } from "./submitPlan";
import type { Attachment } from "./Composer";

const att = (over: Partial<Attachment>): Attachment =>
  ({ name: "f.pdf", cid: "1", text: "Jean Dupont signe.", redactPreview: 0, ...over }) as Attachment;
const forced = [{ value: "Jean Dupont", category: "NAME" }];
const reuse = () => ({ "f.pdf": [{ real: "Jean Dupont", fake: "Marc Rey", tone: "coral" }] });

describe("planSubmit", () => {
  it("a pre-conversation manual « Masquer » rides a send WITH documents (the document case)", () => {
    const plan = planSubmit({
      attachments: [att({})],
      hasConversation: false,
      pendingForced: forced,
      reuseDocReplacements: reuse,
    });
    expect(plan.files).toHaveLength(1);
    expect(plan.opts.forcedRedactions).toEqual(forced);
    expect(plan.opts.docReplacements).toEqual(reuse());
    expect(plan.opts.plotTag).toBeUndefined();
  });

  it("…and a bare text send, identically", () => {
    const plan = planSubmit({
      attachments: [],
      hasConversation: false,
      pendingForced: forced,
      plotTag: "preciser",
      reuseDocReplacements: reuse,
    });
    expect(plan.files).toEqual([]);
    expect(plan.opts.forcedRedactions).toEqual(forced);
    expect(plan.opts.plotTag).toBe("preciser");
    expect(plan.opts.docReplacements).toBeUndefined();
  });

  it("once a conversation exists the buffer is NOT re-sent (the store already holds it)", () => {
    const plan = planSubmit({
      attachments: [att({})],
      hasConversation: true,
      pendingForced: forced,
      reuseDocReplacements: reuse,
    });
    expect(plan.opts.forcedRedactions).toBeUndefined();
  });

  it("an empty buffer is omitted, and files without text do not count as documents", () => {
    const plan = planSubmit({
      attachments: [att({ text: "   " })],
      hasConversation: false,
      pendingForced: [],
      plotTag: "graphique",
      reuseDocReplacements: reuse,
    });
    expect(plan.files).toEqual([]);
    expect(plan.opts.forcedRedactions).toBeUndefined();
    expect(plan.opts.plotTag).toBe("graphique");
  });
});
