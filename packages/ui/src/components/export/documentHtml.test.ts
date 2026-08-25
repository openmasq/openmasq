import { describe, it, expect } from "vitest";
import { documentHtmlFromBlocks, DOCUMENT_PRINT_CSS, escapeHtml } from "./documentHtml";
import { DOC_LIME } from "./documentTheme";
import type { Block } from "./documentBlocks";

const htmlOf = (blocks: Block[]): string => documentHtmlFromBlocks(blocks, "T").html;

describe("documentHtml — the model's document as print HTML", () => {
  it("escapes a real value that LOOKS like markup, so it prints", () => {
    // The blocks carry the user's un-redacted data; `<` in a value is text, not a tag.
    const html = htmlOf([
      { type: "paragraph", runs: [{ text: 'service <ops@acme.fr> & "co" a<b' }] },
    ]);
    expect(html).toBe("<p>service &lt;ops@acme.fr&gt; &amp; &quot;co&quot; a&lt;b</p>");
  });

  it("keeps a fenced code block INERT (escaped, never re-parsed)", () => {
    const html = htmlOf([{ type: "code", text: "<script>alert(1)</script>" }]);
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });

  it("renders the three run marks, nested", () => {
    const html = htmlOf([
      {
        type: "paragraph",
        runs: [{ text: "a", bold: true, italic: true }, { text: "b", code: true }],
      },
    ]);
    expect(html).toBe("<p><strong><em>a</em></strong><code>b</code></p>");
  });

  it("turns an in-run newline into a break, not a lost line", () => {
    expect(htmlOf([{ type: "paragraph", runs: [{ text: "l1\nl2" }] }])).toBe("<p>l1<br>l2</p>");
  });

  it("draws a REAL table, with the first row as a repeating header when there is one", () => {
    const rows = [
      [[{ text: "Poste" }], [{ text: "Montant" }]],
      [[{ text: "Loyer" }], [{ text: "1 250,00 €" }]],
    ];
    const withHead = htmlOf([{ type: "table", rows, head: true }]);
    expect(withHead).toContain("<thead><tr><th>Poste</th><th>Montant</th></tr></thead>");
    expect(withHead).toContain("<tbody><tr><td>Loyer</td><td>1 250,00 €</td></tr></tbody>");
    // No header row (raw `<table>`): every row is body — the first must not be swallowed.
    const noHead = htmlOf([{ type: "table", rows, head: false }]);
    expect(noHead).not.toContain("<thead>");
    expect(noHead).toContain("<td>Poste</td>");
    expect(noHead).toContain("<td>Loyer</td>");
  });

  it("embeds a figure as an inert data: image inside a figure element", () => {
    const html = htmlOf([
      { type: "image", src: "data:image/png;base64,AAA", alt: 'Recettes "T2"', name: "fig_1.png" },
    ]);
    expect(html).toBe(
      '<figure><img src="data:image/png;base64,AAA" alt="Recettes &quot;T2&quot;"></figure>',
    );
    // The alt is escaped like any other user text, and a missing one stays empty (never
    // the filename — that is internal).
    expect(htmlOf([{ type: "image", src: "data:image/png;base64,A" }])).toContain('alt=""');
  });

  it("keeps a figure whole on one page", () => {
    expect(DOCUMENT_PRINT_CSS).toContain("figure{");
    expect(DOCUMENT_PRINT_CSS).toMatch(/figure\{[^}]*break-inside:avoid/);
    expect(DOCUMENT_PRINT_CSS).toMatch(/img\{[^}]*max-height/);
  });

  it("maps lists, quote, hr and clamps a heading level", () => {
    expect(htmlOf([{ type: "list", ordered: true, items: [[{ text: "un" }]] }])).toBe(
      "<ol><li>un</li></ol>",
    );
    expect(htmlOf([{ type: "list", ordered: false, items: [[{ text: "un" }]] }])).toBe(
      "<ul><li>un</li></ul>",
    );
    expect(htmlOf([{ type: "quote", runs: [{ text: "c" }] }])).toBe("<blockquote>c</blockquote>");
    expect(htmlOf([{ type: "hr" }])).toBe("<hr>");
    expect(htmlOf([{ type: "heading", level: 9, runs: [{ text: "h" }] }])).toBe("<h6>h</h6>");
    expect(htmlOf([{ type: "heading", level: 0, runs: [{ text: "h" }] }])).toBe("<h1>h</h1>");
  });

  it("ships a print stylesheet that owns the paper and repeats table headers", () => {
    expect(DOCUMENT_PRINT_CSS).toContain("@page{size:A4");
    // Without this a long table loses its header after the first page.
    expect(DOCUMENT_PRINT_CSS).toContain("thead{display:table-header-group}");
    // A heading must not be the last thing on a page.
    expect(DOCUMENT_PRINT_CSS).toContain("break-after:avoid");
    expect(DOCUMENT_PRINT_CSS).toContain(DOC_LIME);
    // It must not reference a THEME token: the sheet travels inside the file, alone.
    expect(DOCUMENT_PRINT_CSS).not.toContain("var(--");
    // Nor reach the network — there is none in the print session.
    expect(DOCUMENT_PRINT_CSS).not.toMatch(/@import|https?:\/\//);
  });

  it("passes the title through untouched (plain text, escaped by the platform)", () => {
    expect(documentHtmlFromBlocks([], "Rapport <2026>").title).toBe("Rapport <2026>");
    expect(escapeHtml("<b>")).toBe("&lt;b&gt;");
  });
});
