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
 * L'arborescence des dossiers autorisés, dans le rail droit.
 *
 * Ce qui vaut un test ici n'est pas la mise en page mais le contrat avec le disque et
 * avec le reste de l'app : on ne lit un dossier que quand quelqu'un l'ouvre (une lecture
 * spéculative, c'est du disque parcouru pour rien, et sur un dossier réseau ça se sent),
 * on ne le relit pas quand on le referme et le rouvre, et ouvrir un fichier passe par LE
 * panneau partagé — pas par un second visualiseur.
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

/** Un `host.localFs` de test qui compte ses lectures. */
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

    // La racine s'affiche sans qu'aucun listing n'ait été demandé.
    expect(m.findAll(".rr-src")).toHaveLength(1 + STORAGE_COUNT);
    expect(m.findAll(".rr-tree-row")).toHaveLength(0);
    expect(listed).toEqual([]);

    await m.click(".rr-src");
    expect(listed).toEqual(["/w"]);
    expect(m.findAll(".rr-tree-row").map((r) => r.textContent)).toEqual([
      expect.stringContaining("Clients"),
      expect.stringContaining("todo.md"),
    ]);

    // Replier puis rouvrir : le listing est gardé, le disque n'est pas relu.
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
    // Le chemin est la clé : rouvrir le même fichier refocalise son onglet au lieu d'en
    // empiler un second, et un fichier renommé est bien un autre élément.
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

    // Un fichier LOCAL n'a pas d'action « Demander » : il s'ouvre, et le joindre est une
    // autre décision (le panneau la porte). Le survol ne l'offre que sur un dossier.
    expect(m.findAll(".rr-tree-ask")).toHaveLength(1);
    await m.click(".rr-tree-ask");
    // La cible dit ce qu'elle EST — un dossier — pas seulement son chemin : c'est le
    // `kind` qui fait le tag (et la ligne de contexte envoyée au modèle).
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
      // Le serveur TEL QUE main l'enregistre : `local-<catalogId>`, avec ses dossiers
      // sous la clé du catalogue. Viser « filesystem » ne touchait rien, et l'appel
      // partait dans le vide sans que rien ne s'affiche.
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
    // `setDirs` REMPLACE la liste : n'envoyer que le nouveau chemin révoquerait tous les
    // autres dossiers autorisés, en silence.
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
    // Le stockage connecté reste listé : c'est l'autre gisement, il ne dépend pas d'un
    // dossier local accordé.
    expect(m.findAll(".rr-src")).toHaveLength(STORAGE_COUNT);
    await m.unmount();
  });
});
