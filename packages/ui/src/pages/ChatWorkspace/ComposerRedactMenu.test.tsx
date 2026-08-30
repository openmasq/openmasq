// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { mount } from "../../testKit";
import { ComposerRedactMenu, type RedactLevelApi } from "./ComposerRedactMenu";
import { getMessages } from "@openmasq/i18n";
import { privacyLevelMeta } from "../../privacy/privacyLevel";

/**
 * Le clic POSE le niveau, et il le pose sur LA CONVERSATION : le composeur agit sur ce
 * qu'on a devant soi. Le défaut global se change là où on le pèse. La seule exception est
 * forcée — sans conversation, il n'y a rien à surcharger.
 */
const api = (over: Partial<RedactLevelApi> = {}): RedactLevelApi => ({
  level: "renforce",
  bars: 2,
  onApplyConversation: vi.fn(),
  onApplyAlways: vi.fn(),
  ...over,
});

const cardNamed = (m: Awaited<ReturnType<typeof mount>>, label: string): Element =>
  m.findAll(".crm-level").find((el) => el.textContent?.includes(label))!;

describe("ComposerRedactMenu", () => {
  it("un clic pose le niveau sur la CONVERSATION, et ferme", async () => {
    const onDone = vi.fn();
    const a = api();
    const m = await mount(<ComposerRedactMenu api={a} onDone={onDone} />);
    await m.click(cardNamed(m, "Strict"));
    expect(a.onApplyConversation).toHaveBeenCalledWith("strict");
    expect(a.onApplyAlways).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalled();
    await m.unmount();
  });

  /* Sans conversation (premier message), il n'y a rien à surcharger : c'est le défaut qui
     reçoit — sinon le geste ne ferait rien du tout. */
  it("sans conversation, le clic écrit le DÉFAUT", async () => {
    const a = api({ onApplyConversation: undefined });
    const m = await mount(<ComposerRedactMenu api={a} onDone={() => {}} />);
    await m.click(cardNamed(m, "Standard"));
    expect(a.onApplyAlways).toHaveBeenCalledWith("standard");
    await m.unmount();
  });

  it("la coche marque le niveau EN VIGUEUR, et lui seul", async () => {
    const m = await mount(<ComposerRedactMenu api={api({ level: "renforce" })} onDone={() => {}} />);
    expect(cardNamed(m, "Renforcé").querySelector(".crm-level-check")).not.toBeNull();
    expect(cardNamed(m, "Standard").querySelector(".crm-level-check")).toBeNull();
    expect(cardNamed(m, "Strict").querySelector(".crm-level-check")).toBeNull();
    await m.unmount();
  });

  /* Le glyphe EST l'échelle : les TROIS traits sont toujours là, et c'est le nombre de
     traits GRAS qui dit le niveau. N'en dessiner que N faisait perdre la comparaison — un
     seul trait ne se compare à rien — et faisait sauter l'encombrement du bouton d'un
     niveau à l'autre. */
  it("les trois traits sont toujours là ; seul le nombre de GRAS varie", async () => {
    const m = await mount(<ComposerRedactMenu api={api()} onDone={() => {}} />);
    const paths = (label: string) => [
      ...cardNamed(m, label).querySelectorAll(".crm-level-ico svg path"),
    ];
    const bold = (label: string) =>
      paths(label).filter((p) => Number(p.getAttribute("stroke-width")) > 2).length;
    expect(paths("Standard")).toHaveLength(3);
    expect(paths("Renforcé")).toHaveLength(3);
    expect(paths("Strict")).toHaveLength(3);
    expect([bold("Standard"), bold("Renforcé"), bold("Strict")]).toEqual([1, 2, 3]);
    await m.unmount();
  });

  /* Le texte vient de `privacyLevelMeta` (`short`), jamais du composant : une seconde
     surface qui réécrirait les niveaux, c'est deux vocabulaires (règle 9). */
  it("les descriptions sortent du vocabulaire partagé, pas du composant", async () => {
    const m = await mount(<ComposerRedactMenu api={api()} onDone={() => {}} />);
    const texts = m.findAll(".crm-level-desc").map((el) => el.textContent);
    // Hors provider, `useT()` rend le catalogue de la langue par défaut : c'est donc
    // celui-là que le composant a affiché.
    expect(texts).toEqual(privacyLevelMeta(getMessages("fr")).map((meta) => meta.short));
    await m.unmount();
  });
});
