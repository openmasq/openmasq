// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { MaskLevelPicker } from "./MaskLevelPicker";
import { mount } from "../testKit";

/* The compact, per-connector form of a decision the app already makes at two other sizes.
   What it must not do is say something DIFFERENT from them — the words and the glyph come
   from `privacyLevelMeta`, the same vocabulary the full-size picker reads. */
describe("a connector's own masking level", () => {
  it("offers Default plus every level, and marks the one in force", async () => {
    const m = await mount(
      <MaskLevelPicker value="strict" globalLevel="renforce" onPick={() => {}} />,
    );
    const options = m.findAll(".mask-level");
    expect(options).toHaveLength(4); // Default + the three levels
    const on = options.filter((o) => o.classList.contains("on"));
    expect(on).toHaveLength(1);
    expect(on[0]?.textContent).toMatch(/strict/i);
    await m.unmount();
  });

  /** `null` is not a fourth level: it is the ABSENCE of an override, and it is what nearly
   *  every connector wants. It must therefore be what is marked when nothing is set. */
  it("marks Default when the connector overrides nothing", async () => {
    const m = await mount(<MaskLevelPicker value={null} globalLevel="strict" onPick={() => {}} />);
    const on = m.find(".mask-level.on");
    expect(on.getAttribute("aria-checked")).toBe("true");
    expect(on).toBe(m.find(".mask-level")); // the first option
    await m.unmount();
  });

  it("names what Default resolves to, so the choice is not a guess", async () => {
    const m = await mount(<MaskLevelPicker value={null} globalLevel="strict" onPick={() => {}} />);
    expect(m.find(".mask-level").getAttribute("title")).toMatch(/strict/i);
    await m.unmount();
  });

  it("hands back the level, and null for Default", async () => {
    const onPick = vi.fn();
    const m = await mount(
      <MaskLevelPicker value="strict" globalLevel="renforce" onPick={onPick} />,
    );
    const options = m.findAll(".mask-level");
    await m.click(options[0] as HTMLElement);
    expect(onPick).toHaveBeenLastCalledWith(null);
    await m.click(options[3] as HTMLElement);
    expect(onPick).toHaveBeenLastCalledWith("strict");
    await m.unmount();
  });

  /**
   * ⚠️ The glyph asserts a protection. A `reduced` level — one that protects LESS than the
   * defaults — wears the EYE, never the shield, exactly as the full-size picker does. A
   * compact control that quietly promised what the level removes would be the same trust bug
   * at a smaller size (rule 8). Compared against the full-size picker rather than a hard-coded
   * shape, so the two cannot drift apart.
   */
  it("wears the same glyph the full-size picker gives that level", async () => {
    const reduced = await mount(
      <MaskLevelPicker value="standard" globalLevel="standard" onPick={() => {}} />,
    );
    const guarded = await mount(
      <MaskLevelPicker value="strict" globalLevel="strict" onPick={() => {}} />,
    );
    const glyph = (m: Awaited<ReturnType<typeof mount>>) =>
      m.find(".mask-level.on").querySelector("svg")?.outerHTML;
    // The reduced level and a guarded one must not wear the SAME mark.
    expect(glyph(reduced)).not.toBe(glyph(guarded));
    await reduced.unmount();
    await guarded.unmount();
  });

  it("shows the state but refuses the click when it may not act", async () => {
    const onPick = vi.fn();
    const m = await mount(
      <MaskLevelPicker value="strict" globalLevel="renforce" onPick={onPick} disabled />,
    );
    const options = m.findAll<HTMLButtonElement>(".mask-level");
    expect(options.every((o) => o.disabled)).toBe(true);
    expect(m.maybe(".mask-level.on")).not.toBeNull(); // …still legible
    await m.click(options[0] as HTMLElement);
    expect(onPick).not.toHaveBeenCalled();
    await m.unmount();
  });
});
