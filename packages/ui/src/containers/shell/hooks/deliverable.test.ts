import { describe, it, expect, beforeEach } from "vitest";
import {
  deliverablePayload,
  nextDelivery,
  pickDeliverable,
  type DeliverableMessage,
  type DeliveredSeen,
} from "./deliverable";
import { store, panelOpenFile, panelCloseItem } from "../../../state/redux";

const user = (id: string): DeliverableMessage => ({ id, role: "user" });
const reply = (
  id: string,
  attachments?: { name: string; kind: string }[],
  extra: Partial<DeliverableMessage> = {},
): DeliverableMessage => ({ id, role: "assistant", attachments, ...extra });

const doc = (name: string) => ({ name, kind: "file" });
const image = (name: string) => ({ name, kind: "image" });

/** Watch a conversation the way the effect does: one call per store change. */
function watch(steps: readonly DeliverableMessage[][]) {
  let seen: DeliveredSeen = {};
  return steps.map((messages) => {
    const step = nextDelivery(seen, "c1", messages);
    seen = step.seen;
    return step.deliver?.name ?? null;
  });
}

describe("pickDeliverable — the latest COMPLETED turn's document", () => {
  it("takes the last document of the settled reply", () => {
    expect(pickDeliverable([user("u1"), reply("a1", [doc("rapport.pdf")])])).toEqual({
      messageId: "a1",
      name: "rapport.pdf",
    });
  });

  it("a chart stays INLINE — images are never a deliverable", () => {
    expect(pickDeliverable([reply("a1", [image("chart.png")])])).toBeNull();
    expect(pickDeliverable([reply("a1", [image("chart.png"), doc("rapport.pdf")])])).toEqual({
      messageId: "a1",
      name: "rapport.pdf",
    });
  });

  it("the LAST document wins — a run that writes two files delivered the second", () => {
    expect(pickDeliverable([reply("a1", [doc("data.xlsx"), doc("rapport.pdf")])])?.name).toBe(
      "rapport.pdf",
    );
  });

  it("a reply still STREAMING keeps the previous turn's verdict", () => {
    const messages = [
      reply("a1", [doc("rapport.pdf")]),
      user("u2"),
      reply("a2", [doc("nouveau.pdf")], { pending: true }),
    ];
    expect(pickDeliverable(messages)).toEqual({ messageId: "a1", name: "rapport.pdf" });
  });

  it("a FAILED turn delivers nothing, even over an older document", () => {
    expect(
      pickDeliverable([reply("a1", [doc("rapport.pdf")]), reply("a2", [], { error: true })]),
    ).toBeNull();
  });

  it("a user attachment is not a deliverable (only what the app produced)", () => {
    expect(pickDeliverable([{ ...user("u1"), attachments: [doc("contrat.docx")] }])).toBeNull();
  });

  it("stops at the first settled reply — an already-accounted turn is not re-scanned", () => {
    const messages = [reply("a1", [doc("vieux.pdf")]), user("u2"), reply("a2", [])];
    expect(pickDeliverable(messages)).toBeNull();
  });
});

describe("nextDelivery — opening is a TRANSITION watched live", () => {
  it("opening a thread whose last turn produced a file opens NOTHING", () => {
    expect(watch([[user("u1"), reply("a1", [doc("rapport.pdf")])]])).toEqual([null]);
  });

  it("a document that lands while watching opens, exactly once", () => {
    expect(
      watch([
        [user("u1")],
        [user("u1"), reply("a1", [], { pending: true })],
        [user("u1"), reply("a1", [doc("rapport.pdf")], { pending: true })],
        [user("u1"), reply("a1", [doc("rapport.pdf")])],
        [user("u1"), reply("a1", [doc("rapport.pdf")])], // a re-render must not re-open
      ]),
    ).toEqual([null, null, null, "rapport.pdf", null]);
  });

  it("closing the tab sticks — the delivering message stays accounted for", () => {
    const steps = [[user("u1")], [user("u1"), reply("a1", [doc("rapport.pdf")])]];
    let seen: DeliveredSeen = {};
    for (const messages of steps) seen = nextDelivery(seen, "c1", messages).seen;
    // The user closes the panel item; the store is untouched, so the effect re-runs.
    expect(nextDelivery(seen, "c1", steps[1]).deliver).toBeNull();
  });

  it("a REGENERATED reply is a new result and delivers again", () => {
    expect(
      watch([
        [user("u1")],
        [user("u1"), reply("a1", [doc("rapport.pdf")])],
        [user("u1"), reply("a2", [doc("rapport.pdf")])], // regenerate → new message id
      ]),
    ).toEqual([null, "rapport.pdf", "rapport.pdf"]);
  });

  it("a text-only turn between two documents does not resurrect the first", () => {
    expect(
      watch([
        [user("u1")],
        [user("u1"), reply("a1", [doc("rapport.pdf")])],
        [user("u1"), reply("a1", [doc("rapport.pdf")]), user("u2"), reply("a2", [])],
        [
          user("u1"),
          reply("a1", [doc("rapport.pdf")]),
          user("u2"),
          reply("a2", []),
          user("u3"),
          reply("a3", [doc("suite.xlsx")]),
        ],
      ]),
    ).toEqual([null, "rapport.pdf", null, "suite.xlsx"]);
  });

  it("each conversation is watched on its own — a background thread never steals the panel", () => {
    // `c2` is first seen mid-history: it records, it does not open.
    let seen: DeliveredSeen = {};
    seen = nextDelivery(seen, "c1", [user("u1")]).seen;
    const other = nextDelivery(seen, "c2", [reply("b1", [doc("autre.pdf")])]);
    expect(other.deliver).toBeNull();
    expect(other.seen).toEqual({ c1: "", c2: "b1" });
    // …and c1's own record is untouched, so its next delivery still opens.
    expect(
      nextDelivery(other.seen, "c1", [user("u1"), reply("a1", [doc("rapport.pdf")])]).deliver,
    ).toEqual({ messageId: "a1", name: "rapport.pdf" });
  });

  it("an unchanged conversation returns the SAME record object (no churn per token)", () => {
    const messages = [user("u1"), reply("a1", [])];
    const first = nextDelivery({}, "c1", messages);
    const second = nextDelivery(first.seen, "c1", messages);
    expect(second.seen).toBe(first.seen);
    expect(second.deliver).toBeNull();
  });
});

describe("deliverablePayload — what the panel is handed", () => {
  const rows: Record<string, { id: string; name: string; mime: string }[]> = {
    conv: [],
    session: [{ id: "f1", name: "rapport.pdf", mime: "application/pdf" }],
  };
  const list = async (cid: string) => rows[cid] ?? [];

  it("carries the STORAGE id the row was found under, not the conversation id", async () => {
    // A keyless thread stores its files under `sessionConversationId`. Handing the panel
    // the conversation id instead loses the file's meta AND its redacted version.
    expect(
      await deliverablePayload({ messageId: "a1", name: "rapport.pdf" }, ["conv", "session"], list),
    ).toEqual({ id: "f1", name: "rapport.pdf", mime: "application/pdf", convId: "session" });
  });

  it("no DB (browser preview) ⇒ null, never a half-built item", async () => {
    expect(
      await deliverablePayload({ messageId: "a1", name: "rapport.pdf" }, ["conv"], undefined),
    ).toBeNull();
    expect(
      await deliverablePayload({ messageId: "a1", name: "absent.pdf" }, ["session"], list),
    ).toBeNull();
  });
});

describe("a delivered document in the panel", () => {
  beforeEach(() => {
    for (const i of store.getState().panel.items) store.dispatch(panelCloseItem(i.id));
  });

  it("opens the panel and becomes the active tab", () => {
    store.dispatch(
      panelOpenFile({ id: "f1", name: "rapport.pdf", mime: "application/pdf", convId: "session" }),
    );
    const s = store.getState().panel;
    expect(s.open).toBe(true);
    expect(s.activeId).toBe("f1");
    expect(s.items).toEqual([
      { id: "f1", kind: "file", name: "rapport.pdf", mime: "application/pdf", convId: "session" },
    ]);
  });

  it("a second turn delivering the SAME file focuses its tab instead of stacking one", () => {
    store.dispatch(panelOpenFile({ id: "f1", name: "rapport.pdf", convId: "session" }));
    store.dispatch(panelOpenFile({ id: "f2", name: "suite.xlsx", convId: "session" }));
    store.dispatch(panelOpenFile({ id: "f1", name: "rapport.pdf", convId: "session" }));
    expect(store.getState().panel.items.map((i) => i.id)).toEqual(["f1", "f2"]);
    expect(store.getState().panel.activeId).toBe("f1");
  });
});
