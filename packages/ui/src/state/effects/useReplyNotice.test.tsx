// @vitest-environment jsdom
import { BRAND } from "@openmasq/branding";
import { describe, expect, it, vi } from "vitest";
import type { Conversation, Settings } from "../../types";
import { mount } from "../../testKit";
import { useReplyNotice } from "./useReplyNotice";

/**
 * Le CÂBLAGE (la logique pure est dans `../replyNotice.test.ts`) : la transition d'un tick
 * à l'autre, le réglage, et le fait qu'aucun contenu ne parte vers la plateforme.
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
  // jsdom rend `document.hasFocus()` vrai : l'onglet REGARDÉ est donc `activeId`, et viser
  // une autre conversation suffit à jouer « je regarde ailleurs ».
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
    expect(reply).not.toHaveBeenCalled(); // toujours en cours

    await m.rerender(<View convs={[conv("a", false)]} activeId="other" />);
    expect(reply).toHaveBeenCalledTimes(1);
    await m.unmount();
  });

  // Le piège de l'observateur : sans mémoire du tick précédent, chaque rendu re-notifierait.
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

  // La bannière atterrit dans le centre de notifications du système et s'affiche par-dessus
  // tout : le titre d'une conversation est de la donnée RÉELLE, il n'y entre pas.
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
