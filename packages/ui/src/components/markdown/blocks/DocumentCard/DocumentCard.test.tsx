// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { DocumentCard } from "./DocumentCard";
import { MarkdownDocContext } from "../../Markdown";
import { mount } from "../../../../testKit";

/**
 * Pins the CLICK-TO-EDIT contract: the body itself is the edit affordance (no hunt
 * for « Modifier »), but never at the cost of an interactive child (a link must stay
 * a link) nor of a copy gesture (a live selection swallows the click), and never on
 * a read-only card (no `onDocumentEdit` — streaming, nested render).
 */

const DOC = "# Titre\n\nBonjour [lien](https://exemple.fr) monde.";

const render = (onDocumentEdit?: (o: string, n: string) => Promise<boolean>) =>
  mount(
    <MarkdownDocContext.Provider value={{ onDocumentEdit }}>
      <DocumentCard title="Titre" text={DOC} />
    </MarkdownDocContext.Provider>,
  );

describe("DocumentCard — clic-pour-modifier", () => {
  it("un clic sur le corps ouvre l'éditeur, sans passer par « Modifier »", async () => {
    const ui = await render(async () => true);
    expect(ui.find(".md-document-body").getAttribute("data-editable")).toBe("1");
    // There is NO MORE « Modifier » button: the text is the affordance.
    expect(ui.el.textContent).not.toContain("Modifier");
    await ui.click(".md-document-body p");
    expect(ui.maybe(".md-document-edit")).not.toBeNull();
    await ui.unmount();
  });

  it("l'éditeur montre le DOCUMENT, pas sa source markdown", async () => {
    const ui = await render(async () => true);
    await ui.click(".md-document-body p");
    const ed = ui.find(".md-document-edit");
    // The title is a real <h1>, and the `#` is nowhere on screen.
    expect(ed.querySelector("h1")?.textContent).toBe("Titre");
    expect(ed.textContent).not.toContain("#");
    // And it carries the rendered typography (`.md`), not that of an input field.
    expect(ed.classList.contains("md")).toBe(true);
    expect(ed.getAttribute("contenteditable")).toBe("true");
    await ui.unmount();
  });

  it("un clic sur un élément interactif (lien) n'entre PAS en édition", async () => {
    const ui = await render(async () => true);
    await ui.click(".md-document-body a");
    expect(ui.maybe(".md-document-edit")).toBeNull();
    await ui.unmount();
  });

  it("sans onDocumentEdit (stream, rendu imbriqué) le corps reste inerte", async () => {
    const ui = await render(undefined);
    const body = ui.find(".md-document-body");
    expect(body.getAttribute("data-editable")).toBeNull();
    await ui.click(body);
    expect(ui.maybe(".md-document-edit")).toBeNull();
    await ui.unmount();
  });

  it("une sélection de texte en cours avale le clic (copier n'ouvre pas l'éditeur)", async () => {
    const ui = await render(async () => true);
    const p = ui.find(".md-document-body p");
    const range = document.createRange();
    range.selectNodeContents(p);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    await ui.click(p);
    expect(ui.maybe(".md-document-edit")).toBeNull();
    await ui.unmount();
  });
});
