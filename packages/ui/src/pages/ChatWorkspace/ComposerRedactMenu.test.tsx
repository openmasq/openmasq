// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { mount } from "../../testKit";
import { ComposerRedactMenu, type RedactLevelApi } from "./ComposerRedactMenu";
import { getMessages } from "@openmasq/i18n";
import { privacyLevelMeta } from "../../privacy/privacyLevel";

/**
 * The click SETS the level, and it sets it on THE CONVERSATION: the composer acts on
 * what's in front of you. The global default changes where it's weighed. The only exception
 * is forced — without a conversation, there is nothing to override.
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

  /* Without a conversation (first message), there is nothing to override: the default
     receives it — otherwise the gesture would do nothing at all. */
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

  /* The glyph IS the scale: the THREE bars are always there, and it's the number of
     BOLD bars that states the level. Drawing only N of them lost the comparison — a
     single bar compares to nothing — and made the button's footprint jump from one
     level to another. */
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

  /* The text comes from `privacyLevelMeta` (`short`), never from the component: a second
     surface that rewrote the levels would be two vocabularies (rule 9). */
  it("les descriptions sortent du vocabulaire partagé, pas du composant", async () => {
    const m = await mount(<ComposerRedactMenu api={api()} onDone={() => {}} />);
    const texts = m.findAll(".crm-level-desc").map((el) => el.textContent);
    // Outside a provider, `useT()` renders the default language's catalogue: so that's
    // the one the component displayed.
    expect(texts).toEqual(privacyLevelMeta(getMessages("fr")).map((meta) => meta.short));
    await m.unmount();
  });
});
