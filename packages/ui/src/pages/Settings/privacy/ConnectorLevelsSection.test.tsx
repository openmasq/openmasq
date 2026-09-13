// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { ConnectorLevelsSection } from "./ConnectorLevelsSection";
import { mount } from "../../../testKit";
import type { Settings } from "../../../types";

/* The MCP pane is where a connector's level is SET, one at a time behind its modal. This
   section answers the OTHER question, the one the privacy screen owes: what is NOT following
   the level I just read? Without it, that level reads as the whole truth while an override
   sits two screens away. */
const settings = (connectorMasking?: Settings["connectorMasking"]) =>
  ({ redactCategories: {}, connectorMasking }) as Settings;

describe("the connectors that do not follow the global level", () => {
  /**
   * ⚠️ The rule that shapes the whole section. Fifty-seven rows of "Default" would bury the
   * one or two that matter, and its entire job is to make those impossible to miss — so with
   * nothing to say it says nothing, rather than drawing an empty frame.
   */
  it("renders NOTHING when every connector follows the level", async () => {
    for (const s of [settings(), settings({})]) {
      const m = await mount(<ConnectorLevelsSection draft={s} setDraft={() => {}} />);
      expect(m.el.textContent).toBe("");
      await m.unmount();
    }
  });

  /** An entry that carries no masking is not an exception either — that is exactly the
   *  shape `withConnectorLevel` refuses to leave behind. */
  it("ignores an entry that overrides nothing", async () => {
    const m = await mount(
      <ConnectorLevelsSection draft={settings({ notion: {} })} setDraft={() => {}} />,
    );
    expect(m.el.textContent).toBe("");
    await m.unmount();
  });

  it("lists the ones that differ, and only those", async () => {
    const m = await mount(
      <ConnectorLevelsSection
        draft={settings({ notion: { level: "strict" }, github: {} })}
        setDraft={() => {}}
      />,
    );
    const rows = m.findAll(".connector-level-row");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.textContent).toMatch(/notion/i);
    await m.unmount();
  });

  it("names the connector, and marks the level it is on", async () => {
    const m = await mount(
      <ConnectorLevelsSection
        draft={settings({ notion: { level: "strict" } })}
        setDraft={() => {}}
      />,
    );
    expect(m.find(".connector-level-name").textContent).toMatch(/notion/i);
    expect(m.find(".mask-level.on").textContent).toMatch(/strict/i);
    await m.unmount();
  });

  /** Changing it HERE writes the same way the MCP pane does — one home for that edit. */
  it("edits through the same helper, so Default leaves no entry", async () => {
    const setDraft = vi.fn();
    const m = await mount(
      <ConnectorLevelsSection
        draft={settings({ notion: { level: "strict" } })}
        setDraft={setDraft}
      />,
    );
    await m.click(m.findAll(".mask-level")[0] as HTMLElement); // "Default"
    const updater = setDraft.mock.calls[0]?.[0] as (s: Settings) => Settings;
    expect(updater(settings({ notion: { level: "strict" } })).connectorMasking).toBeUndefined();
    await m.unmount();
  });
});
