// @vitest-environment jsdom
import { getMessages } from "@openmasq/i18n";
import { describe, expect, it, vi } from "vitest";
import { mount } from "../../../testKit";
import { McpDirList } from "./McpDirList";

const t = getMessages("fr");

describe("McpDirList — un dossier se lit comme un dossier", () => {
  it("son NOM d'abord, où il vit dessous, le chemin entier en bulle", async () => {
    const m = await mount(<McpDirList dirs={["/Users/ana/Documents/Clients"]} onRemove={() => {}} />);
    expect(m.find(".mcp-dir-name").textContent).toBe("Clients");
    expect(m.find(".mcp-dir-path").textContent).toBe("~/Documents");
    expect(m.find(".mcp-dir").getAttribute("title")).toBe("/Users/ana/Documents/Clients");
    await m.unmount();
  });

  it("retirer est un vrai bouton, nommé, qui rend le dossier visé", async () => {
    const onRemove = vi.fn();
    const m = await mount(<McpDirList dirs={["/a/x", "/a/y"]} onRemove={onRemove} />);
    await m.click(`[aria-label="${t.mcpTab.removeDir("/a/y")}"]`);
    expect(onRemove).toHaveBeenCalledWith("/a/y");
    await m.unmount();
  });

  it("refusé, il le dit — au lieu de disparaître", async () => {
    const m = await mount(
      <McpDirList dirs={["/a/x"]} onRemove={() => {}} removeDisabled removeTitle={t.mcpTab.atLeastOneDir} />,
    );
    const x = m.find<HTMLButtonElement>(".mcp-dir-x");
    expect(x.disabled).toBe(true);
    expect(x.title).toBe(t.mcpTab.atLeastOneDir);
    await m.unmount();
  });

  it("vide, rien — le bouton « Ajouter » de l'appelant suffit", async () => {
    const m = await mount(<McpDirList dirs={[]} onRemove={() => {}} />);
    expect(m.findAll(".mcp-dir-list")).toHaveLength(0);
    await m.unmount();
  });
});
