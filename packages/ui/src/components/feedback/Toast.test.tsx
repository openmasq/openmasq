// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "../../testKit";
import { Toast } from "./Toast";

/**
 * THE toast is transient: it leaves on its own, through the caller (`onDone`), and never
 * hides itself in place — a toast that stayed would be a chip. Its one action fires but
 * does not cancel the clock: an undo that waits forever is a chip too.
 */
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("Toast", () => {
  it("calls onDone after its duration, and not before", async () => {
    const onDone = vi.fn();
    const m = await mount(<Toast tone="success" message="Noté" duration={1600} onDone={onDone} />);
    expect(m.el.querySelector(".om-toast")?.textContent).toContain("Noté");
    vi.advanceTimersByTime(1500);
    expect(onDone).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(onDone).toHaveBeenCalledTimes(1);
    await m.unmount();
  });

  it("docks by default, anchors at a point when asked, and wears its tone", async () => {
    const docked = await mount(<Toast tone="warning" message="x" onDone={() => {}} />);
    const d = docked.el.querySelector(".om-toast")!;
    expect(d.className).toContain("om-toast-dock");
    expect(d.className).toContain("kb--warning");
    await docked.unmount();
    const anchored = await mount(<Toast tone="info" message="x" at={{ x: 40, y: 80 }} onDone={() => {}} />);
    const a = anchored.el.querySelector(".om-toast") as HTMLElement;
    expect(a.className).toContain("om-toast-at");
    expect(a.style.left).toBe("40px");
    await anchored.unmount();
  });

  it("offers ONE action that fires, while the clock keeps running", async () => {
    const onDone = vi.fn();
    const undo = vi.fn();
    const m = await mount(
      <Toast tone="info" message="Supprimé" action={{ label: "Annuler", onClick: undo }} onDone={onDone} />,
    );
    await m.click(".om-toast-act");
    expect(undo).toHaveBeenCalledTimes(1);
    expect(onDone).not.toHaveBeenCalled();
    vi.advanceTimersByTime(5000);
    expect(onDone).toHaveBeenCalledTimes(1);
    await m.unmount();
  });

  it("clears its timer on unmount — no onDone into a gone caller", async () => {
    const onDone = vi.fn();
    const m = await mount(<Toast tone="success" message="x" duration={100} onDone={onDone} />);
    await m.unmount();
    vi.advanceTimersByTime(500);
    expect(onDone).not.toHaveBeenCalled();
  });
});
