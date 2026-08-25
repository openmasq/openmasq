// @vitest-environment jsdom
import { Provider } from "react-redux";
import { describe, expect, it } from "vitest";
import { store } from "../../../state/redux";
import { mount } from "../../../testKit";
import { StorageSources } from "./StorageSources";

/**
 * Le groupe « Cloud » du panneau « Dossiers ».
 *
 * Ce qui vaut un test : un compte que l'app sait parcourir devient une RACINE (et cesse
 * d'être une ligne d'état — sinon il apparaîtrait deux fois), on ne lit rien tant qu'on ne
 * l'ouvre pas, on descend par l'ID du fournisseur, et un fichier distant ne prétend jamais
 * s'ouvrir dans le panneau : ses octets ne passent pas par cette voie.
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
    // Laisser `sources()` se résoudre : avant ça, le connecteur est encore une simple
    // ligne d'état — c'est justement le repli quand rien n'est navigable.
    await m.rerender(panel);
    await m.rerender(panel);

    // Le compte est une racine : rien n'est lu tant qu'on ne l'ouvre pas.
    expect(listed).toEqual([]);
    console.log("SRC ROWS:", m.findAll(".rr-src").map((r) => r.className + " | " + r.textContent));
    const driveRoot = m.findAll(".rr-src").find((r) => r.textContent?.includes("Google Drive"))!;
    await m.click(driveRoot);
    expect(listed).toEqual([null]);
    expect(m.findAll(".rr-tree-row").map((r) => r.textContent)).toEqual([
      expect.stringContaining("Clients"),
      expect.stringContaining("Devis.pdf"),
    ]);

    // Descendre passe l'id du dossier, pas un chemin inventé.
    await m.click(m.findAll(".rr-tree-row").find((r) => r.textContent?.includes("Clients"))!);
    expect(listed).toEqual([null, "f1"]);

    // Un fichier distant ne s'ouvre pas dans le panneau — ses octets ne passent pas par
    // là. Le cliquer DEMANDE, ce que le modèle sait faire avec les outils du connecteur.
    await m.click(m.findAll(".rr-tree-row").find((r) => r.textContent?.includes("Devis.pdf"))!);
    // La cible porte son ESPÈCE (fichier, pas dossier) et son service : c'est ce qui
    // fait le tag de la conversation et la ligne de contexte du modèle.
    expect(asked).toEqual([{ kind: "file", name: "Devis.pdf", source: "Google Drive" }]);
    expect(store.getState().panel.items.some((i) => i.kind === "localfile")).toBe(false);

    await m.unmount();
  });

});
