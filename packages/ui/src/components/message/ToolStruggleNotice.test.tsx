// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { mount } from "../../testKit";
import { ToolStruggleNotice } from "./ToolStruggleNotice";
import { OpenConnectorProvider } from "../../containers/providers/connectors";
import type { ToolStruggle } from "../../agent/mcpAgent";

const struggle = (kind: ToolStruggle["kind"]): ToolStruggle => ({
  server: "gmail",
  tool: "gmail__list_recent",
  kind,
});

/**
 * An expired OAuth token is the most common `connector_error`, and the caption used to
 * end on « Ouvrez Réglages → Connecteurs »: a screen to find, then a connector
 * to recognize among a dozen — when the message had just named it. These tests
 * pin that the fix is reachable FROM the turn that failed.
 */
describe("ToolStruggleNotice — la réparation est à portée de clic", () => {
  it("offre « Reconnecter » sur un refus de connecteur, et ouvre CE connecteur", async () => {
    const open = vi.fn();
    const m = await mount(
      <OpenConnectorProvider value={open}>
        <ToolStruggleNotice struggle={struggle("connector_error")} />
      </OpenConnectorProvider>,
    );
    await m.click("button");
    // The faulty connector's id, not a generic screen: that's the whole difference.
    expect(open).toHaveBeenCalledWith("gmail");
    await m.unmount();
  });

  it("l'offre vaut aussi pour un outil absent — ça se règle dans la même fiche", async () => {
    const open = vi.fn();
    const m = await mount(
      <OpenConnectorProvider value={open}>
        <ToolStruggleNotice struggle={struggle("unknown_tool")} />
      </OpenConnectorProvider>,
    );
    await m.click("button");
    expect(open).toHaveBeenCalledWith("gmail");
    await m.unmount();
  });

  it("PAS de bouton quand la cause tient au modèle — il enverrait au mauvais endroit", async () => {
    const open = vi.fn();
    for (const kind of ["arg_error", "no_tool_used"] as const) {
      const m = await mount(
        <OpenConnectorProvider value={open}>
          <ToolStruggleNotice struggle={struggle(kind)} modelName="Laguna" />
        </OpenConnectorProvider>,
      );
      expect(m.maybe("button")).toBeNull();
      await m.unmount();
    }
    expect(open).not.toHaveBeenCalled();
  });

  it("nomme la MARQUE du connecteur, jamais le transport « Ipc » (signalé 13/08)", async () => {
    // What the loop actually recorded: `server` = the MCP client's connection
    // id. The caption therefore opened on « Ipc a refusé l'appel… », and « Reconnecter »
    // opened the sheet for a connector that doesn't exist. The tool's name, though, tells the truth —
    // including on a message ALREADY recorded, which this test replays.
    const open = vi.fn();
    const m = await mount(
      <OpenConnectorProvider value={open}>
        <ToolStruggleNotice
          struggle={{ server: "ipc", tool: "gmail__search_messages", kind: "connector_error" }}
        />
      </OpenConnectorProvider>,
    );
    const txt = m.find(".shield-caption").textContent ?? "";
    expect(txt).toContain("Gmail");
    expect(txt).not.toContain("Ipc");
    await m.click("button");
    expect(open).toHaveBeenCalledWith("gmail");
    await m.unmount();
  });

  it("la phrase parle français : l'action est traduite, le nom technique reste en infobulle", async () => {
    const m = await mount(
      <ToolStruggleNotice
        struggle={{ server: "ipc", tool: "gmail__search_messages", kind: "connector_error" }}
      />,
    );
    const caption = m.find(".shield-caption");
    expect(caption.textContent).toContain("Recherche");
    // The tool's name is a support address, not a sentence: it doesn't appear
    // in the text, but stays reachable for whoever needs to read it.
    expect(caption.textContent).not.toContain("gmail__search_messages");
    expect(caption.getAttribute("title")).toContain("gmail__search_messages");
    await m.unmount();
  });

  it("sans canal monté, retombe sur la PROSE qui nomme la destination", async () => {
    // `useOpenConnector()` is null in a preview harness or a test: the component
    // must stay mountable AND stay useful. Without this prose, the user would have no
    // indication left where they had one.
    const m = await mount(<ToolStruggleNotice struggle={struggle("connector_error")} />);
    expect(m.maybe("button")).toBeNull();
    expect(m.find(".shield-caption").textContent).toContain("Réglages");
    await m.unmount();
  });
});
