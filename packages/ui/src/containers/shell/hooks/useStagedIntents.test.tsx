// @vitest-environment jsdom
import { Provider } from "react-redux";
import { describe, expect, it } from "vitest";
import { store } from "../../../state/redux";
import { mount } from "../../../testKit";
import type { ChatStore } from "../../../state/store";
import type { ExtractedFile } from "../../../host";
import { useStagedIntents, type StagedIntents } from "./useStagedIntents";

/**
 * The attachment-staging contract — the two rules born from a real bug (05/08:
 * « cliquer sur Demander remplace le précédent fichier »):
 *  1. « Demander » on a file ADDS to the OPEN conversation — it only creates one
 *     if there is none yet. Each click used to open its own new conversation, so
 *     the second file « replaced » the first on screen.
 *  2. Successive additions form a QUEUE: consuming the head (`setAttach(null)`)
 *     reveals the next one — a single slot was losing whichever arrived first.
 */

const wrap = (children: React.ReactNode) => <Provider store={store}>{children}</Provider>;

const fakeFile = (name: string): ExtractedFile => ({ name, text: "" }) as ExtractedFile;

/** A ChatStore reduced to what the hook consumes. */
function fakeChat(activeId: string | null) {
  const created: string[] = [];
  let n = 0;
  const chat = {
    activeId,
    createConversation: () => {
      const id = `conv-${++n}`;
      created.push(id);
      return id;
    },
    markCompetenceUsed: () => {},
  } as unknown as ChatStore;
  return { chat, created };
}

function Probe({ chat, out }: { chat: ChatStore; out: { api?: StagedIntents } }) {
  out.api = useStagedIntents({ chat, go: () => {} });
  return null;
}

describe("useStagedIntents — attachFile", () => {
  it("ajoute à la conversation OUVERTE (aucune création) quand il y en a une", async () => {
    const { chat, created } = fakeChat("conv-ouverte");
    const out: { api?: StagedIntents } = {};
    const m = await mount(<Probe chat={chat} out={out} />, { wrap });

    out.api!.attachFile(fakeFile("a.pdf"));
    await m.rerender(<Probe chat={chat} out={out} />);

    expect(created).toEqual([]);
    expect(out.api!.pending.attach).toMatchObject({ convId: "conv-ouverte" });
    await m.unmount();
  });

  it("ne crée une conversation que s'il n'y en a AUCUNE", async () => {
    const { chat, created } = fakeChat(null);
    const out: { api?: StagedIntents } = {};
    const m = await mount(<Probe chat={chat} out={out} />, { wrap });

    out.api!.attachFile(fakeFile("a.pdf"));
    await m.rerender(<Probe chat={chat} out={out} />);

    expect(created).toEqual(["conv-1"]);
    expect(out.api!.pending.attach).toMatchObject({ convId: "conv-1" });
    await m.unmount();
  });

  it("met les ajouts successifs en FILE — consommer la tête révèle le suivant", async () => {
    const { chat } = fakeChat("conv-ouverte");
    const out: { api?: StagedIntents } = {};
    const m = await mount(<Probe chat={chat} out={out} />, { wrap });

    out.api!.attachFile(fakeFile("a.pdf"));
    out.api!.attachFile(fakeFile("b.pdf"));
    await m.rerender(<Probe chat={chat} out={out} />);

    expect(out.api!.pending.attach?.file.name).toBe("a.pdf");
    out.api!.pending.setAttach(null); // consumed (ChatPane)
    await m.rerender(<Probe chat={chat} out={out} />);
    expect(out.api!.pending.attach?.file.name).toBe("b.pdf");
    // Both were aimed at the SAME conversation — that's the requested « se rajouter ».
    expect(out.api!.pending.attach?.convId).toBe("conv-ouverte");
    await m.unmount();
  });
});
