// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act } from "react";
import { mount } from "../../testKit";
import { ConvRow } from "./ConvRow";
import type { Conversation } from "../../types";

/**
 * The sidebar row is the app's PRIMARY navigation, so it must be operable without a
 * mouse: a focusable `role="option"` selected with Entrée/Espace. The guard the last
 * case pins: a key pressed ON the ⋯ actions button (which lives inside the row) must
 * never double as a row selection.
 */

const conv = (over: Partial<Conversation> = {}): Conversation => ({
  id: "c1",
  title: "Ma conversation",
  modelId: "unknown-model",
  messages: [],
  createdAt: 0,
  updatedAt: Date.now(),
  ...over,
});

const press = async (el: Element, key: string) => {
  await act(async () => {
    el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
};

describe("ConvRow keyboard access", () => {
  it("is a focusable option and reflects selection", async () => {
    const m = await mount(<ConvRow conv={conv()} active onSelect={() => {}} />);
    const row = m.find('[role="option"]');
    expect(row.tabIndex).toBe(0);
    expect(row.getAttribute("aria-selected")).toBe("true");
    await m.unmount();
  });

  it("selects on Entrée and on Espace", async () => {
    const onSelect = vi.fn();
    const m = await mount(<ConvRow conv={conv()} active={false} onSelect={onSelect} />);
    const row = m.find('[role="option"]');
    await press(row, "Enter");
    await press(row, " ");
    expect(onSelect).toHaveBeenCalledTimes(2);
    await m.unmount();
  });

  it("a key on the ⋯ actions button does not select the row", async () => {
    const onSelect = vi.fn();
    const m = await mount(
      <ConvRow conv={conv()} active={false} onSelect={onSelect} onRename={() => {}} />,
    );
    await press(m.find(".conv-actions button"), "Enter");
    expect(onSelect).not.toHaveBeenCalled();
    await m.unmount();
  });

  it("a plain click still selects (mouse behaviour preserved)", async () => {
    const onSelect = vi.fn();
    const m = await mount(<ConvRow conv={conv()} active={false} onSelect={onSelect} />);
    await m.click('[role="option"]');
    expect(onSelect).toHaveBeenCalledTimes(1);
    await m.unmount();
  });
});
