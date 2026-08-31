// @vitest-environment jsdom
import { Provider } from "react-redux";
import { describe, expect, it } from "vitest";
import type { LocalFsEntry } from "../../../host";
import { store, panelCloseItem } from "../../../state/redux";
import { mount } from "../../../testKit";
import { STORAGE_CONNECTORS } from "@openmasq/catalog/mcp";
import { FolderTreePanel } from "./FolderTreePanel";

const STORAGE_COUNT = STORAGE_CONNECTORS.length;

/**
 * The tree of granted folders, in the right rail.
 *
 * What's worth testing here isn't the layout but the contract with the disk and
 * with the rest of the app: a folder is read only when someone opens it (a speculative
 * read is disk walked for nothing, and on a network folder it shows),
 * it isn't re-read when closed then reopened, and opening a file goes through THE
 * shared panel — not a second viewer.
 */

const dir = (path: string, name: string): LocalFsEntry => ({
  name,
  path,
  kind: "dir",
  size: 0,
  mtime: 0,
});
const file = (path: string, name: string): LocalFsEntry => ({
  name,
  path,
  kind: "file",
  size: 12,
  mtime: 0,
});

/** A test `host.localFs` that counts its reads. */
function fakeFs(listings: Record<string, LocalFsEntry[]>) {
  const listed: string[] = [];
  return {
    listed,
    fs: {
      roots: async () => ({ available: true, roots: ["/w"] }),
      list: async (path: string) => {
        listed.push(path);
        return { path, entries: listings[path] ?? [], truncated: false };
      },
      stat: async () => file("/w/x", "x"),
      read: async () => ({ base64: "", size: 0 }),
      search: async () => ({ entries: [], truncated: false }),
      mkdir: async () => ({ path: "" }),
      rename: async () => ({ path: "" }),
      trash: async () => undefined,
      open: async () => undefined,
    },
  };
}

const wrap = (children: React.ReactNode) => <Provider store={store}>{children}</Provider>;

describe("FolderTreePanel — les dossiers autorisés dans le rail", () => {
  it("ne lit un dossier qu'à son ouverture, et ne le relit pas ensuite", async () => {
    const { fs, listed } = fakeFs({
      "/w": [dir("/w/Clients", "Clients"), file("/w/todo.md", "todo.md")],
    });
    const m = await mount(<FolderTreePanel />, { host: { localFs: fs }, wrap });

    // The root shows without any listing having been requested.
    expect(m.findAll(".rr-src")).toHaveLength(1 + STORAGE_COUNT);
    expect(m.findAll(".rr-tree-row")).toHaveLength(0);
    expect(listed).toEqual([]);

    await m.click(".rr-src");
    expect(listed).toEqual(["/w"]);
    expect(m.findAll(".rr-tree-row").map((r) => r.textContent)).toEqual([
      expect.stringContaining("Clients"),
      expect.stringContaining("todo.md"),
    ]);

    // Collapse then reopen: the listing is kept, the disk isn't re-read.
    await m.click(".rr-src");
    expect(m.findAll(".rr-tree-row")).toHaveLength(0);
    await m.click(".rr-src");
    expect(listed).toEqual(["/w"]);

    await m.unmount();
  });

  it("ouvrir un fichier l'envoie dans LE panneau latéral partagé", async () => {
    const { fs } = fakeFs({ "/w": [file("/w/devis.pdf", "devis.pdf")] });
    const m = await mount(<FolderTreePanel />, { host: { localFs: fs }, wrap });

    await m.click(".rr-src");
    const fileRow = m.findAll(".rr-tree-row").find((r) => r.textContent?.includes("devis.pdf"))!;
    await m.click(fileRow);

    const item = store.getState().panel.items.find((i) => i.id === "localfile:/w/devis.pdf");
    // The path is the key: reopening the same file refocuses its tab instead of
    // stacking a second one, and a renamed file really is a different item.
    expect(item).toMatchObject({ kind: "localfile", name: "devis.pdf" });
    expect(store.getState().panel.open).toBe(true);

    store.dispatch(panelCloseItem("localfile:/w/devis.pdf"));
    await m.unmount();
  });

  it("« Demander » ne s'offre que sur un DOSSIER, et rend l'entrée telle quelle", async () => {
    const { fs } = fakeFs({ "/w": [dir("/w/Clients", "Clients"), file("/w/todo.md", "todo.md")] });
    const asked: { kind: string; path?: string }[] = [];
    const m = await mount(<FolderTreePanel onAskTarget={(t) => asked.push({ kind: t.kind, path: t.path })} />, {
      host: { localFs: fs },
      wrap,
    });
    await m.click(".rr-src");

    // A LOCAL file has no « Demander » action: it opens, and attaching it is a
    // separate decision (the panel carries it). The hover only offers it on a folder.
    expect(m.findAll(".rr-tree-ask")).toHaveLength(1);
    await m.click(".rr-tree-ask");
    // The target says what it IS — a folder — not just its path: it's the
    // `kind` that makes the tag (and the context line sent to the model).
    expect(asked).toEqual([{ kind: "folder", path: "/w/Clients" }]);

    await m.unmount();
  });

  it("« Ajouter un dossier » AJOUTE — il ne remplace pas les autorisations en place", async () => {
    const { fs } = fakeFs({ "/w": [] });
    const calls: { id: string; key: string; dirs: string[] }[] = [];
    const mcp = {
      pickDir: async () => "/nouveau",
      setDirs: async (id: string, key: string, dirs: string[]) => {
        calls.push({ id, key, dirs });
        return {} as never;
      },
      // The server AS main registers it: `local-<catalogId>`, with its folders
      // under the catalog key. Targeting "filesystem" touched nothing, and the call
      // went into the void with nothing shown.
      list: async () => [
        {
          id: "local-filesystem",
          name: "Filesystem",
          url: "",
          kind: "stdio" as const,
          connected: true,
          authorized: true,
          params: { root: ["/w"] },
        },
      ],
      onChanged: () => () => {},
    };
    const m = await mount(<FolderTreePanel />, {
      host: { localFs: fs, mcp: mcp as never },
      wrap,
    });

    await m.click(".rr-tree-add");
    // `setDirs` REPLACES the list: sending only the new path would silently revoke all
    // the other granted folders.
    expect(calls).toEqual([{ id: "local-filesystem", key: "root", dirs: ["/w", "/nouveau"] }]);

    await m.unmount();
  });

  it("un refus de l'hôte se VOIT — il revient dans la réponse, il n'est pas levé", async () => {
    const { fs } = fakeFs({ "/w": [] });
    const mcp = {
      pickDir: async () => "/refusé",
      setDirs: async () => ({ error: "dossier introuvable" }) as never,
      list: async () => [
        {
          id: "local-filesystem",
          name: "Filesystem",
          url: "",
          kind: "stdio" as const,
          connected: true,
          authorized: true,
          params: { root: ["/w"] },
        },
      ],
      onChanged: () => () => {},
    };
    const m = await mount(<FolderTreePanel />, { host: { localFs: fs, mcp: mcp as never }, wrap });

    await m.click(".rr-tree-add");
    expect(m.find(".rr-tree-error").textContent).toContain("dossier introuvable");

    await m.unmount();
  });

  it("sans dossier autorisé, le panneau le DIT au lieu de rester vide", async () => {
    const m = await mount(<FolderTreePanel />, {
      host: {
        localFs: {
          ...fakeFs({}).fs,
          roots: async () => ({ available: false, roots: [] }),
        },
      },
      wrap,
    });
    expect(m.findAll(".rr-tree-row")).toHaveLength(0);
    expect(m.find(".rr-empty").textContent).toContain("Aucun dossier autorisé");
    // Connected storage stays listed: it's the other deposit, it doesn't depend on a
    // granted local folder.
    expect(m.findAll(".rr-src")).toHaveLength(STORAGE_COUNT);
    await m.unmount();
  });
});
