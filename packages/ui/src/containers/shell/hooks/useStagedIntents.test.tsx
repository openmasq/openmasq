// @vitest-environment jsdom
import { Provider } from "react-redux";
import { describe, expect, it } from "vitest";
import { store } from "../../../state/redux";
import { mount } from "../../../testKit";
import type { ChatStore } from "../../../state/store";
import type { ExtractedFile } from "../../../host";
import { useStagedIntents, type StagedIntents } from "./useStagedIntents";

/**
 * Le contrat du staging d'attachements — les deux règles nées d'un bug réel (05/08 :
 * « cliquer sur Demander remplace le précédent fichier ») :
 *  1. « Demander » sur un fichier AJOUTE à la conversation OUVERTE — il n'en crée une
 *     que s'il n'y en a aucune. Chaque clic ouvrait sa conversation neuve, donc le
 *     deuxième fichier « remplaçait » le premier à l'écran.
 *  2. Les ajouts successifs font la FILE : consommer la tête (`setAttach(null)`)
 *     révèle le suivant — un slot unique perdait le premier arrivé.
 */

const wrap = (children: React.ReactNode) => <Provider store={store}>{children}</Provider>;

const fakeFile = (name: string): ExtractedFile => ({ name, text: "" }) as ExtractedFile;

/** Un ChatStore réduit à ce que le hook consomme. */
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
    out.api!.pending.setAttach(null); // consommé (ChatPane)
    await m.rerender(<Probe chat={chat} out={out} />);
    expect(out.api!.pending.attach?.file.name).toBe("b.pdf");
    // Les deux visaient la MÊME conversation — c'est le « se rajouter » demandé.
    expect(out.api!.pending.attach?.convId).toBe("conv-ouverte");
    await m.unmount();
  });
});
