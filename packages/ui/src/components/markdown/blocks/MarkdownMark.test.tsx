// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { Markdown } from "../Markdown";
import { FileOpenProvider, type FileOpenApi } from "../../../containers/providers/fileOpen";
import { mount } from "../../../testKit";

/**
 * The « ouvrir dans le panneau » icon for a redacted file PATH (journal 02/08:
 * a reply lists local financial statements, the user wants to view them with a click).
 * Pins `MarkdownMark`'s gates: context provided + path inside a GRANTED
 * root + a FILE-shaped value — and the click passes the REAL path. It's all
 * UX: the main-process grant re-checks every read.
 */

const PATH = "/Users/claire/Desktop/DOCS/bilan_2023-1.pdf";
const DIR = "/Users/claire/Desktop/DOCS";
// The mark comes from the COFFRE: the real value is the path, the fake its pseudonym.
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
    // On the left: the button precedes the path's mark in the DOM.
    const mark = ui.el.querySelector(`mark[data-real="${PATH}"]`)!;
    expect(btn.compareDocumentPosition(mark) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await ui.click(".md-open-file");
    expect(openLocalPath).toHaveBeenCalledWith(PATH);
    await ui.unmount();
  });

  it("aucune icône pour un mark non-chemin, ni pour un chemin de DOSSIER", async () => {
    const ui = await render({ openLocalPath: vi.fn(), isOpenablePath: () => true });
    // Only one icon: the file. Neither the company, nor the folder (no bytes to see).
    expect(ui.findAll(".md-open-file")).toHaveLength(1);
    await ui.unmount();
  });

  it("un nom de fichier NU se résout vers l'unique chemin du coffre — ambigu ⇒ rien", async () => {
    // Journal 02/08: the reply cites « bilan_2023-1.pdf » with no path; the coffre
    // knows the full path. Two possible candidates = no icon (never guessed).
    const bareVault = {
      fake1: "/Users/claire/Desktop/DOCS/bilan_2023-1.pdf",
      fake2: "bilan_2023-1.pdf",
      fake3: "/Users/claire/Desktop/DOCS/notes.csv",
      fake4: "/Users/claire/Desktop/AUTRE/notes.csv", // « notes.csv » becomes ambiguous
      fake5: "notes.csv",
    };
    const kinds = { "bilan_2023-1.pdf": "path", "notes.csv": "path" };
    const openLocalPath = vi.fn();
    const ui = await mount(
      <FileOpenProvider value={{ openLocalPath, isOpenablePath: () => true }}>
        <Markdown content="Voir bilan_2023-1.pdf et notes.csv" vault={bareVault} kinds={kinds} />
      </FileOpenProvider>,
    );
    expect(ui.findAll(".md-open-file")).toHaveLength(1); // the unique name only
    await ui.click(".md-open-file");
    expect(openLocalPath).toHaveBeenCalledWith("/Users/claire/Desktop/DOCS/bilan_2023-1.pdf");
    await ui.unmount();
  });

  it("hors racine accordée, ou sans contexte (mobile/préversion), aucune icône", async () => {
    const outside = await render({ openLocalPath: vi.fn(), isOpenablePath: () => false });
    expect(outside.maybe(".md-open-file")).toBeNull();
    await outside.unmount();
    // Without a provider: the no-op default keeps the sheet mountable and silent.
    const bare = await mount(<Markdown content={`fichier ${PATH}`} vault={VAULT} kinds={KINDS} />);
    expect(bare.maybe(".md-open-file")).toBeNull();
    expect(bare.el.querySelector("mark")).not.toBeNull(); // the mark itself is always there
    await bare.unmount();
  });
});
