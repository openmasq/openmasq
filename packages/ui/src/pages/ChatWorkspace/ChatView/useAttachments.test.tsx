// @vitest-environment jsdom
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RedactFn } from "../../../send/redactionEngine";
import { maskQueue } from "../../../state/files/maskQueue";
import { isStagedBusy } from "../../../state/files/stagedActivity";
import { createStagedFiles } from "../../../state/files/stagedFiles";
import { mount } from "../../../testKit";
import type { Conversation } from "../../../types";
import type { Attachment } from "../Composer";
import type { ChatViewProps } from "./types";
import { useAttachments, type AttachmentsApi } from "./useAttachments";

// A detector whose runs the test releases by hand — the masking stays « en cours ».
const engine = vi.hoisted(() => {
  const release: (() => void)[] = [];
  const calls: string[] = [];
  const fn = (text: string) => {
    calls.push(text);
    return new Promise((r) => release.push(() => r({ text, matches: [] })));
  };
  return { release, calls, fn };
});
vi.mock("../../../send/redaction", async (orig) => ({
  ...(await orig<typeof import("../../../send/redaction")>()),
  useRedaction: () => engine.fn as unknown as RedactFn,
}));

const conv = (id: string) => ({ id, title: id, messages: [] }) as unknown as Conversation;
const chip: Attachment = { name: "contrat.pdf", kind: "pdf", text: "Clause.\n".repeat(40), chars: 320, redactPreview: 0, cid: "c-life", redacting: true };
const settle = () => act(async () => new Promise((r) => setTimeout(r, 0)));

function setup() {
  const staged = createStagedFiles();
  staged.set("A", [chip]);
  const api: { current?: AttachmentsApi } = {};
  const Probe = ({ c }: { c: Conversation }) => {
    api.current = useAttachments({
      conversation: c,
      settings: undefined,
      getStagedFiles: (id: string) => staged.get(id) as readonly Attachment[],
      onStagedFilesChange: (id: string, items: readonly Attachment[]) => staged.set(id, items),
    } as unknown as ChatViewProps);
    return null;
  };
  return { staged, api, Probe };
}

afterEach(() => {
  maskQueue.cancel("c-life");
  engine.release.length = 0;
  engine.calls.length = 0;
});

describe("useAttachments — a masking run belongs to the conversation, not to the screen", () => {
  it("switching conversation and coming back does NOT restart the masking", async () => {
    const { staged, api, Probe } = setup();
    const view = await mount(<Probe c={conv("A")} />);
    await settle();
    expect(engine.calls).toHaveLength(1); // the restore queued the one run
    await view.rerender(<Probe c={conv("B")} />);
    await view.rerender(<Probe c={conv("A")} />);
    await settle();
    expect(engine.calls).toHaveLength(1); // NOT re-queued from 0 %
    expect(maskQueue.has("c-life")).toBe(true);
    expect(isStagedBusy("A")).toBe(true);
    // The run lands while the user is on ANOTHER conversation: in A's staging, not B's.
    await view.rerender(<Probe c={conv("B")} />);
    await act(async () => engine.release.shift()!());
    await settle();
    expect((staged.get("A")[0] as Attachment).redacting).toBe(false);
    expect((staged.get("A")[0] as Attachment).replacements).toEqual([]);
    expect(staged.get("B")).toEqual([]);
    expect(isStagedBusy("A")).toBe(false);
    await view.rerender(<Probe c={conv("A")} />);
    expect(api.current!.attachments[0]).toMatchObject({ redacting: false, replacements: [] });
    await view.unmount();
  });

  it("unmounting the screen (Bibliothèque) leaves the run going; removing the chip cancels it", async () => {
    const { staged, api, Probe } = setup();
    const view = await mount(<Probe c={conv("A")} />);
    await settle();
    await view.unmount();
    expect(maskQueue.has("c-life")).toBe(true);
    const again = await mount(<Probe c={conv("A")} />);
    await settle();
    expect(engine.calls).toHaveLength(1);
    await act(async () => api.current!.removeAttachment(0));
    expect(maskQueue.has("c-life")).toBe(false);
    expect(staged.get("A")).toEqual([]);
    await again.unmount();
  });
});
