// @vitest-environment jsdom
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { getMessages } from "@openmasq/i18n";
import { mount } from "../../testKit";
import type { Conversation } from "../../types";
import { useSendPipeline } from "./useSendPipeline";

const send = vi.fn();
vi.mock("../../send/sendOrchestrator", () => ({ createSendMessage: () => send }));
// The library reload: a.pdf comes back, b.pdf is gone.
vi.mock("../../pages/Library/reattach", () => ({
  loadReattachFile: async (_h: unknown, src: { name: string }) => {
    if (src.name === "b.pdf") throw new Error("missing");
    return { name: src.name, kind: "document", text: "Bail A", chars: 6 };
  },
}));

const t = getMessages("fr");
const FULL = "compare\n\n=== document-1.pdf ===\nBail A\n\n=== document-2.pdf ===\nBail B";

function conv(modelContent: string | undefined): Conversation {
  return {
    id: "c1",
    messages: [
      { id: "u1", role: "user", content: "compare", modelContent, attachments: [{ name: "a.pdf", kind: "file" }, { name: "b.pdf", kind: "file" }] },
      { id: "a1", role: "assistant", content: "", error: true, errorText: "boom" },
    ],
  } as unknown as Conversation;
}

async function retry(c: Conversation) {
  send.mockClear();
  let state = c;
  const patchConversation = vi.fn((_id: string, f: (c: Conversation) => Conversation) => (state = f(state)));
  const host = {
    db: {
      listFiles: async () => [
        { id: "1", name: "a.pdf", mime: "application/pdf" },
        { id: "2", name: "b.pdf", mime: "application/pdf" },
      ],
      loadFile: async () => null,
    },
  };
  const deps = {
    host, settings: {}, activeId: "c1", keyConfigured: new Set(), patchConversation, t,
    conversations: [c], activeIdRef: { current: "c1" }, cancelRef: { current: new Map() }, finishRef: { current: new Map() },
  } as unknown as Parameters<typeof useSendPipeline>[0];
  let api: ReturnType<typeof useSendPipeline> | null = null;
  function Probe() {
    api = useSendPipeline(deps);
    return null;
  }
  const ui = await mount(<Probe />);
  await act(async () => {
    await api!.regenerate("a1", "c1");
    await new Promise((r) => setTimeout(r, 0));
  });
  await ui.unmount();
  return () => state;
}

describe("regenerate — one of two documents fails to reload", () => {
  it("re-sends the FULL persisted payload, never the partial file set", async () => {
    await retry(conv(FULL));
    expect(send).toHaveBeenCalledTimes(1);
    const [text, files, opts] = send.mock.calls[0];
    expect(text).toBe("compare");
    expect(files).toBeUndefined();
    expect(opts.resendWire).toBe(FULL);
  });

  it("with no persisted payload: sends NOTHING, keeps the turn and names the missing file", async () => {
    const state = await retry(conv(undefined));
    expect(send).not.toHaveBeenCalled();
    const msgs = state().messages;
    expect(msgs.map((m) => m.id)).toEqual(["u1", "a1"]);
    expect(msgs[1].errorText).toBe(t.runtime.send.retryMissingFiles(1, "b.pdf"));
  });
});
