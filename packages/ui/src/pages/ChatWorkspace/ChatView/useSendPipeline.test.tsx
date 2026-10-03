// @vitest-environment jsdom
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { getMessages } from "@openmasq/i18n";
import { mount } from "../../../testKit";
import type { Attachment } from "../Composer";
import type { ChatViewProps } from "./types";
import { useSendPipeline, type SendPipelineApi } from "./useSendPipeline";

const t = getMessages("fr");
const file = (over: Partial<Attachment>): Attachment => ({
  name: "bail.pdf",
  kind: "document",
  text: "Bail commercial",
  chars: 15,
  redactPreview: 0,
  cid: over.name ?? "bail.pdf",
  ...over,
});

/** The submit's collaborators as spies: what a refusal must NOT touch is observable. */
async function setup(attachments: Attachment[], input = "compare ces baux") {
  const spies = {
    onSend: vi.fn(async () => {}),
    clearInput: vi.fn(),
    setAttachments: vi.fn(),
    setAttachWarning: vi.fn(),
    resetAll: vi.fn(),
    clearPendingForced: vi.fn(),
  };
  const p = { conversation: null, settings: {}, onSend: spies.onSend } as unknown as ChatViewProps;
  const deps = {
    input,
    clearInput: spies.clearInput,
    activeStreaming: false,
    att: { attachments, setAttachments: spies.setAttachments, setAttachWarning: spies.setAttachWarning },
    forced: { pendingForced: [], clearPendingForced: spies.clearPendingForced, forcedValues: [], docDeletedRef: { current: new Set() } },
    intents: { resetAll: spies.resetAll },
    gates: {},
  } as unknown as Parameters<typeof useSendPipeline>[1];
  const api: { current: SendPipelineApi | null } = { current: null };
  function Probe() {
    api.current = useSendPipeline(p, deps);
    return null;
  }
  const ui = await mount(<Probe />);
  return { api, spies, ui };
}

const nothingCleared = (s: Awaited<ReturnType<typeof setup>>["spies"]) => {
  expect(s.onSend).not.toHaveBeenCalled();
  expect(s.clearInput).not.toHaveBeenCalled();
  expect(s.setAttachments).not.toHaveBeenCalled();
  expect(s.resetAll).not.toHaveBeenCalled();
  expect(s.clearPendingForced).not.toHaveBeenCalled();
};

describe("ChatView submit — never drops a staged file silently", () => {
  it("a file still being READ refuses the send and clears NOTHING", async () => {
    const { api, spies, ui } = await setup([file({}), file({ name: "scan.pdf", text: "", extracting: true })]);
    await act(async () => api.current!.submit());
    expect(spies.setAttachWarning).toHaveBeenCalledWith(t.runtime.send.fileStillReading);
    nothingCleared(spies);
    await ui.unmount();
  });

  it("unreadable files open the confirmation by NAME; « Annuler » keeps everything", async () => {
    const { api, spies, ui } = await setup([file({}), file({ name: "a.pdf", text: "", error: "x" })]);
    await act(async () => api.current!.submit());
    expect(api.current!.unreadConfirm).toEqual(["a.pdf"]);
    nothingCleared(spies);
    await act(async () => api.current!.cancelUnread());
    expect(api.current!.unreadConfirm).toBeNull();
    nothingCleared(spies);
    await ui.unmount();
  });

  it("« Envoyer sans eux » sends the readable files only, through the normal send", async () => {
    const { api, spies, ui } = await setup([file({}), file({ name: "a.pdf", text: "" })]);
    await act(async () => api.current!.submit());
    await act(async () => api.current!.confirmUnread());
    expect(spies.onSend).toHaveBeenCalledTimes(1);
    const [, sent] = spies.onSend.mock.calls[0] as unknown as [string, Attachment[]];
    expect(sent.map((a) => a.name)).toEqual(["bail.pdf"]);
    expect(api.current!.unreadConfirm).toBeNull();
    await ui.unmount();
  });
});
