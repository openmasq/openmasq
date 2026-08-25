// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { Markdown } from "../Markdown";
import { FileOpenProvider, type FileOpenApi } from "../../../containers/providers/fileOpen";
import { mount } from "../../../testKit";

/**
 * L'icône « ouvrir dans le panneau » d'un CHEMIN de fichier redacted (journal 02/08 :
 * une réponse liste des bilans locaux, l'utilisateur veut les visualiser d'un clic).
 * Épingle les gates de `MarkdownMark` : contexte fourni + chemin dans une racine
 * ACCORDÉE + valeur en forme de FICHIER — et le clic passe le chemin RÉEL. Tout est
 * UX : le grant de main re-vérifie chaque lecture.
 */

const PATH = "/Users/claire/Desktop/DOCS/bilan_2023-1.pdf";
const DIR = "/Users/claire/Desktop/DOCS";
// Le mark vient du COFFRE : la valeur réelle est le chemin, le faux son pseudonyme.
const VAULT = { "/Users/x9q/Desktop/AB12/qq3.pdf": PATH, "Kelby Works": "Karl Studio" };
const KINDS = { [PATH]: "path", "Karl Studio": "company" };

const render = (api: FileOpenApi, content = `Voici ${PATH} et ${DIR} — signé Karl Studio.`) =>
  mount(
    <FileOpenProvider value={api}>
      <Markdown content={content} vault={VAULT} kinds={KINDS} />
    </FileOpenProvider>,
  );

describe("MarkdownMark — l'icône « ouvrir » d'un chemin de fichier", () => {
  it("dessine l'icône à GAUCHE du chemin ouvrable, et le clic passe le chemin RÉEL", async () => {
    const openLocalPath = vi.fn();
    const ui = await render({ openLocalPath, isOpenablePath: (p) => p.startsWith(DIR) });
    const btn = ui.find<HTMLButtonElement>(".md-open-file");
    expect(btn.getAttribute("aria-label")).toContain("bilan_2023-1.pdf");
    // À gauche : le bouton précède le mark du chemin dans le DOM.
    const mark = ui.el.querySelector(`mark[data-real="${PATH}"]`)!;
    expect(btn.compareDocumentPosition(mark) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await ui.click(".md-open-file");
    expect(openLocalPath).toHaveBeenCalledWith(PATH);
    await ui.unmount();
  });

  it("aucune icône pour un mark non-chemin, ni pour un chemin de DOSSIER", async () => {
    const ui = await render({ openLocalPath: vi.fn(), isOpenablePath: () => true });
    // Une seule icône : le fichier. Ni la company, ni le dossier (pas de bytes à voir).
    expect(ui.findAll(".md-open-file")).toHaveLength(1);
    await ui.unmount();
  });

  it("un nom de fichier NU se résout vers l'unique chemin du coffre — ambigu ⇒ rien", async () => {
    // Journal 02/08 : la réponse cite « bilan_2023-1.pdf » sans chemin ; le coffre
    // connaît le chemin complet. Deux candidats possibles = aucune icône (jamais deviné).
    const bareVault = {
      fake1: "/Users/claire/Desktop/DOCS/bilan_2023-1.pdf",
      fake2: "bilan_2023-1.pdf",
      fake3: "/Users/claire/Desktop/DOCS/notes.csv",
      fake4: "/Users/claire/Desktop/AUTRE/notes.csv", // « notes.csv » devient ambigu
      fake5: "notes.csv",
    };
    const kinds = { "bilan_2023-1.pdf": "path", "notes.csv": "path" };
    const openLocalPath = vi.fn();
    const ui = await mount(
      <FileOpenProvider value={{ openLocalPath, isOpenablePath: () => true }}>
        <Markdown content="Voir bilan_2023-1.pdf et notes.csv" vault={bareVault} kinds={kinds} />
      </FileOpenProvider>,
    );
    expect(ui.findAll(".md-open-file")).toHaveLength(1); // le nom unique seulement
    await ui.click(".md-open-file");
    expect(openLocalPath).toHaveBeenCalledWith("/Users/claire/Desktop/DOCS/bilan_2023-1.pdf");
    await ui.unmount();
  });

  it("hors racine accordée, ou sans contexte (mobile/préversion), aucune icône", async () => {
    const outside = await render({ openLocalPath: vi.fn(), isOpenablePath: () => false });
    expect(outside.maybe(".md-open-file")).toBeNull();
    await outside.unmount();
    // Sans provider : le défaut no-op garde la feuille montable et muette.
    const bare = await mount(<Markdown content={`fichier ${PATH}`} vault={VAULT} kinds={KINDS} />);
    expect(bare.maybe(".md-open-file")).toBeNull();
    expect(bare.el.querySelector("mark")).not.toBeNull(); // le mark, lui, est toujours là
    await bare.unmount();
  });
});
