// @vitest-environment jsdom
import { Provider } from "react-redux";
import { describe, expect, it } from "vitest";
import { store } from "../../../state/redux";
import { mount } from "../../../testKit";
import { StorageSources } from "./StorageSources";

/**
 * The « Cloud » group of the « Dossiers » panel.
 *
 * What's worth a test: an account the app can browse becomes a ROOT (and stops
 * being a status row — otherwise it would appear twice), nothing is read until it's
 * opened, we descend by the provider's ID, and a remote file never claims to
 * open in the panel: its bytes don't pass through that route.
 */

const wrap = (children: React.ReactNode) => <Provider store={store}>{children}</Provider>;

describe("StorageSources — le stockage connecté", () => {
  it("un stockage connecté se DÉPLIE comme un dossier local, et ne se relit pas", async () => {
    const listed: (string | null)[] = [];
    const cloudFs = {
      sources: async () => ({
        sources: [{ id: "google-drive", connectorId: "google-drive", label: "moi@exemple.fr" }],
      }),
      list: async (_sourceId: string, folderId: string | null) => {
        listed.push(folderId);
        return {
          entries:
            folderId === null
              ? [
                  { id: "f1", name: "Clients", kind: "dir" as const, mtime: 0 },
                  { id: "d1", name: "Devis.pdf", kind: "file" as const, mtime: 0 },
                ]
              : [{ id: "d2", name: "Monot.pdf", kind: "file" as const, mtime: 0 }],
        };
      },
    };
    const asked: { kind: string; name: string; source?: string }[] = [];
    const panel = <StorageSources onAsk={(t) => asked.push({ kind: t.kind, name: t.name, source: t.source })} />;
    const m = await mount(panel, { host: { cloudFs }, wrap });
    // Let `sources()` resolve: before that, the connector is still a plain
    // status row — that's exactly the fallback for when nothing is navigable.
    await m.rerender(panel);
    await m.rerender(panel);

    // The account is a root: nothing is read until it's opened.
    expect(listed).toEqual([]);
    console.log("SRC ROWS:", m.findAll(".rr-src").map((r) => r.className + " | " + r.textContent));
    const driveRoot = m.findAll(".rr-src").find((r) => r.textContent?.includes("Google Drive"))!;
    await m.click(driveRoot);
    expect(listed).toEqual([null]);
    expect(m.findAll(".rr-tree-row").map((r) => r.textContent)).toEqual([
      expect.stringContaining("Clients"),
      expect.stringContaining("Devis.pdf"),
    ]);

    // Descending passes the folder's id, not a made-up path.
    await m.click(m.findAll(".rr-tree-row").find((r) => r.textContent?.includes("Clients"))!);
    expect(listed).toEqual([null, "f1"]);

    // A remote file doesn't open in the panel — its bytes don't pass
    // through there. Clicking it ASKS, which the model can do with the connector's tools.
    await m.click(m.findAll(".rr-tree-row").find((r) => r.textContent?.includes("Devis.pdf"))!);
    // The target carries its KIND (file, not folder) and its service: that's what
    // makes the conversation's tag and the model's context line.
    expect(asked).toEqual([{ kind: "file", name: "Devis.pdf", source: "Google Drive" }]);
    expect(store.getState().panel.items.some((i) => i.kind === "localfile")).toBe(false);

    await m.unmount();
  });

});
