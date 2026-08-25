// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { blocksFromElement, resolveImageBlocks, tableRowRuns, type Block } from "./documentBlocks";

function md(html: string): Element {
  const div = document.createElement("div");
  div.className = "md";
  div.innerHTML = html;
  return div;
}
const runsOf = (b: Block) => (b as Extract<Block, { runs: unknown }>).runs;

describe("blocksFromElement", () => {
  it("extracts headings and inline bold/italic", () => {
    const blocks = blocksFromElement(
      md("<h1>Titre</h1><p>Bonjour <strong>Marcus</strong> et <em>Acme</em>.</p>"),
    );
    expect(blocks[0]).toEqual({ type: "heading", level: 1, runs: [{ text: "Titre" }] });
    expect(blocks[1].type).toBe("paragraph");
    expect(runsOf(blocks[1])).toContainEqual({ text: "Marcus", bold: true });
    expect(runsOf(blocks[1])).toContainEqual({ text: "Acme", italic: true });
  });

  it("extracts ordered and unordered lists", () => {
    const blocks = blocksFromElement(md("<ul><li>un</li><li>deux</li></ul><ol><li>a</li></ol>"));
    expect(blocks[0]).toMatchObject({ type: "list", ordered: false });
    expect((blocks[0] as Extract<Block, { type: "list" }>).items).toHaveLength(2);
    expect(blocks[1]).toMatchObject({ type: "list", ordered: true });
  });

  it("reads the REAL text inside redaction marks (un-redacted)", () => {
    const blocks = blocksFromElement(md('<p>Cher <mark class="redaction-mark">Marcus Foy</mark>,</p>'));
    expect(runsOf(blocks[0]).map((r) => r.text).join("")).toBe("Cher Marcus Foy,");
  });

  it("handles blockquote, hr, code and tables", () => {
    const blocks = blocksFromElement(
      md("<blockquote><p>cite</p></blockquote><hr><pre>ligne</pre><table><tr><td>a</td><td>b</td></tr></table>"),
    );
    expect(blocks.map((b) => b.type)).toEqual(["quote", "hr", "code", "table"]);
    // A table keeps its CELLS (the HTML→PDF path draws a real grid); the two flat
    // exporters flatten it back to one tab-separated line per row, losing nothing.
    expect(tableRowRuns(blocks[3] as Extract<Block, { type: "table" }>)[0][0].text).toBe("a\tb");
  });

  it("marks a GFM header row so the PDF can repeat it across pages", () => {
    const withHead = blocksFromElement(
      md("<table><thead><tr><th>h</th></tr></thead><tbody><tr><td>v</td></tr></tbody></table>"),
    )[0] as Extract<Block, { type: "table" }>;
    expect(withHead.head).toBe(true);
    expect(withHead.rows).toHaveLength(2);
    const noHead = blocksFromElement(md("<table><tr><td>v</td></tr></table>"))[0] as Extract<
      Block,
      { type: "table" }
    >;
    expect(noHead.head).toBe(false);
  });

  it("keeps an INLINED figure and drops one that could never be embedded", () => {
    // A chart the model generated is already a `data:` URL in the DOM (MarkdownImage
    // resolved the stored bytes) — that is what makes it embeddable in the PDF.
    const blocks = blocksFromElement(
      md('<p><img src="data:image/png;base64,AAA" alt="Recettes" data-file="fig_1.png"></p><p>vrai texte</p>'),
    );
    expect(blocks[0]).toEqual({
      type: "image",
      src: "data:image/png;base64,AAA",
      alt: "Recettes",
      name: "fig_1.png",
    });
    expect(blocks[1].type).toBe("paragraph");
    // A remote (or unresolved) image can't be fetched by the offline print window: dropped
    // rather than exported as a broken box. Same for a bare unresolved name.
    expect(blocksFromElement(md('<p><img src="https://x.tld/a.png"></p>'))).toEqual([]);
    expect(blocksFromElement(md('<p><img src="chart.png"></p>'))).toEqual([]);
  });

  it("re-loads a figure at FULL resolution for the export, and keeps the preview on a miss", async () => {
    const blocks = blocksFromElement(
      md('<p><img src="data:image/png;base64,SMALL" data-file="fig_1.png"></p>'),
    );
    const full = await resolveImageBlocks(blocks, async () => "data:image/png;base64,FULL");
    expect((full[0] as Extract<Block, { type: "image" }>).src).toBe("data:image/png;base64,FULL");
    // Resolver absent, returning null, or throwing → the on-screen preview is kept, so the
    // figure is never LOST from the document.
    for (const load of [undefined, async () => null, async () => { throw new Error("db"); }]) {
      const kept = await resolveImageBlocks(blocks, load as never);
      expect((kept[0] as Extract<Block, { type: "image" }>).src).toBe("data:image/png;base64,SMALL");
    }
  });

  it("returns nothing for a null/empty root", () => {
    expect(blocksFromElement(null)).toEqual([]);
  });
});

describe("micro-typographie française — appliquée à la couture, jamais au code", () => {
  const NBSP = "\u00A0";

  it("les runs de prose sortent avec leurs insécables (les 3 exports en héritent)", () => {
    const blocks = blocksFromElement(md("<p>Prix : <strong>12 000 €</strong> !</p>"));
    const texts = runsOf(blocks[0]).map((r) => (r as { text: string }).text).join("");
    expect(texts).toBe(`Prix${NBSP}: 12${NBSP}000${NBSP}€${NBSP}!`);
  });

  it("un run `code` inline est laissé intact — l'espace y est un caractère", () => {
    const blocks = blocksFromElement(md("<p>tapez <code>a : b</code> ici</p>"));
    const code = runsOf(blocks[0]).find((r) => (r as { code?: boolean }).code);
    expect((code as { text: string }).text).toBe("a : b");
  });

  it("un bloc de code entier est laissé intact", () => {
    const blocks = blocksFromElement(md("<pre><code>if (a) { b : c }</code></pre>"));
    expect(blocks[0]).toEqual({ type: "code", text: "if (a) { b : c }" });
  });

  it("une valeur RÉELLE d'un mark est soudée comme le reste — export-only, sans effet sur le coffre", () => {
    const blocks = blocksFromElement(
      md('<p>Montant : <mark data-real="25 000 €">[MONTANT1]</mark></p>'),
    );
    const texts = runsOf(blocks[0]).map((r) => (r as { text: string }).text).join("");
    expect(texts).toBe(`Montant${NBSP}: 25${NBSP}000${NBSP}€`);
  });
});
