// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { mount } from "../../testKit";
import { APPLIED_PILL_MS, ComposerRedactButton } from "./ComposerRedactButton";
import type { RedactLevelApi } from "./ComposerRedactMenu";
import { getMessages } from "@openmasq/i18n";

/**
 * The button is the ONLY trace of the level in the action row, so it must name it; and a
 * click must leave more than one bolder stroke behind — the pill says what was set, where,
 * and « Annuler » takes it back through the api's `restore`.
 */
const api = (over: Partial<RedactLevelApi> = {}): RedactLevelApi => ({
  level: "renforce",
  bars: 2,
  overridden: false,
  forcedCount: 0,
  onApplyConversation: vi.fn(() => ({
    scope: "conversation" as const,
    convId: "c1",
    cats: undefined,
  })),
  onApplyAlways: vi.fn(() => ({ scope: "default" as const, cats: {} as never })),
  restore: vi.fn(),
  ...over,
});
const fr = getMessages("fr");

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const clickCard = async (label: string) => {
  const card = [...document.querySelectorAll(".crm-level")].find(
    (el) => el.querySelector(".crm-level-name")?.textContent === label,
  ) as HTMLElement;
  await act(async () => card.click());
};

describe("ComposerRedactButton", () => {
  it("le tooltip nomme le niveau en vigueur ET la portée d'un clic", async () => {
    const m = await mount(<ComposerRedactButton api={api()} />);
    expect(m.find("button").getAttribute("title")).toBe(
      fr.composer.redactLevelTip("Renforcé", fr.composer.scopeShortConversation),
    );
    await m.unmount();
    const none = await mount(
      <ComposerRedactButton api={api({ onApplyConversation: undefined, level: "custom" })} />,
    );
    expect(none.find("button").getAttribute("title")).toBe(
      fr.composer.redactLevelTip(fr.leaves.privacyLevels.custom, fr.composer.scopeShortDefault),
    );
    await none.unmount();
  });

  it("après un clic : le menu se ferme, la pastille dit quoi et où, « Annuler » restaure", async () => {
    const a = api();
    const m = await mount(<ComposerRedactButton api={a} />);
    await m.click("button");
    expect(document.querySelector(".crm-pop")).not.toBeNull();
    await clickCard("Strict");
    expect(document.querySelector(".crm-pop")).toBeNull();
    const pill = m.find(".crm-applied");
    expect(pill.textContent).toContain(
      fr.composer.applied("Strict", fr.composer.scopeShortConversation),
    );
    await m.click(".crm-applied-undo");
    expect(a.restore).toHaveBeenCalledWith({
      scope: "conversation",
      convId: "c1",
      cats: undefined,
    });
    expect(m.maybe(".crm-applied")).toBeNull();
    await m.unmount();
  });

  it("la pastille s'efface d'elle-même", async () => {
    const m = await mount(<ComposerRedactButton api={api()} />);
    await m.click("button");
    await clickCard("Allégé");
    expect(m.maybe(".crm-applied")).not.toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(APPLIED_PILL_MS + 1);
    });
    expect(m.maybe(".crm-applied")).toBeNull();
    await m.unmount();
  });
});
