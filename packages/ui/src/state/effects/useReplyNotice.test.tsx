// @vitest-environment jsdom
import { BRAND } from "@openmasq/branding";
import { describe, expect, it, vi } from "vitest";
import type { Conversation, Settings } from "../../types";
import { mount } from "../../testKit";
import { useReplyNotice } from "./useReplyNotice";

/**
 * The WIRING (the pure logic is in `../conversation/replyNotice.test.ts`): the transition from one tick
 * to the next, the setting, and the fact that no content leaves for the platform.
 */

const conv = (id: string, pending: boolean): Conversation =>
  ({
    id,
    title: "Dossier Ferracci — IBAN",
    modelId: "gpt-5.5",
    createdAt: 0,
    updatedAt: 0,
    messages: [
      { id: `${id}-u`, role: "user", content: "bonjour" },
      { id: `${id}-a`, role: "assistant", content: "", ...(pending ? { pending: true } : {}) },
    ],
  }) as Conversation;

function harness(settings: Partial<Settings> = {}) {
  const reply = vi.fn();
  const host = {
    notify: { supported: async () => true, reply, onActivate: () => () => {} },
  };
  // jsdom makes `document.hasFocus()` true: the WATCHED tab is therefore `activeId`, and
  // targeting another conversation is enough to play « I'm looking elsewhere ».
  const View = ({ convs, activeId }: { convs: Conversation[]; activeId: string }) => {
    useReplyNotice({
      conversations: convs,
      activeId,
      settings: settings as Settings,
      host: host as never,
      onOpen: () => {},
    });
    return null;
  };
  return { reply, host, View };
}

describe("useReplyNotice", () => {
  it("notifie quand un tour se pose dans un fil qu'on ne regarde pas", async () => {
    const { reply, host, View } = harness();
    const m = await mount(<View convs={[conv("a", true)]} activeId="other" />, {
      host: host as never,
    });
    expect(reply).not.toHaveBeenCalled(); // still in progress

    await m.rerender(<View convs={[conv("a", false)]} activeId="other" />);
    expect(reply).toHaveBeenCalledTimes(1);
    await m.unmount();
  });

  // The observer trap: without memory of the previous tick, every render would re-notify.
  it("ne notifie qu'UNE fois — un re-rendu sur le même état est muet", async () => {
    const { reply, host, View } = harness();
    const m = await mount(<View convs={[conv("a", true)]} activeId="other" />, {
      host: host as never,
    });
    await m.rerender(<View convs={[conv("a", false)]} activeId="other" />);
    await m.rerender(<View convs={[conv("a", false)]} activeId="other" />);
    expect(reply).toHaveBeenCalledTimes(1);
    await m.unmount();
  });

  it("se tait quand le réglage est coupé", async () => {
    const { reply, host, View } = harness({ notifyOnReply: false });
    const m = await mount(<View convs={[conv("a", true)]} activeId="other" />, {
      host: host as never,
    });
    await m.rerender(<View convs={[conv("a", false)]} activeId="other" />);
    expect(reply).not.toHaveBeenCalled();
    await m.unmount();
  });

  // The banner lands in the system's notification center and displays over
  // everything: a conversation's title is REAL data, so it never goes into it.
  it("n'envoie à la plateforme ni contenu ni titre de conversation", async () => {
    const { reply, host, View } = harness();
    const m = await mount(<View convs={[conv("a", true)]} activeId="other" />, {
      host: host as never,
    });
    await m.rerender(<View convs={[conv("a", false)]} activeId="other" />);
    const sent = JSON.stringify(reply.mock.calls[0][0]);
    expect(sent).not.toContain("Ferracci");
    expect(sent).not.toContain("bonjour");
    expect(reply.mock.calls[0][0]).toMatchObject({ conversationId: "a", title: BRAND.name });
    await m.unmount();
  });
});
