import { describe, it, expect } from "vitest";
import { htmlToText, HTML_TEXT_MAX } from "./htmlText";

describe("htmlToText", () => {
  it("extracts readable text and drops tags", () => {
    const out = htmlToText(`<p>Bonjour <b>monde</b></p>`);
    expect(out).toBe("Bonjour monde");
  });

  it("drops script/style/noscript/svg content entirely (never runs, never leaks)", () => {
    const html = `
      <style>.x{color:red}</style>
      <script>alert('xss'); var secret='token123'</script>
      <noscript>activez JS</noscript>
      <svg><text>vector</text></svg>
      <p>Contenu visible</p>`;
    const out = htmlToText(html);
    expect(out).toBe("Contenu visible");
    expect(out).not.toContain("token123");
    expect(out).not.toContain("alert");
  });

  it("turns block boundaries into line breaks (structure kept)", () => {
    const out = htmlToText(`<h1>Titre</h1><p>Ligne 1</p><p>Ligne 2</p>`);
    expect(out).toBe("Titre\nLigne 1\nLigne 2");
  });

  it("decodes named and numeric entities", () => {
    expect(htmlToText(`<p>A &amp; B &#233;t&eacute;? &#x2014; oui &nbsp;&#39;ok&#39;</p>`)).toContain("A & B");
    expect(htmlToText(`<p>tiret &#x2014; ici</p>`)).toContain("—");
    expect(htmlToText(`<p>&#39;quote&#39;</p>`)).toBe("'quote'");
  });

  it("collapses whitespace and trims", () => {
    expect(htmlToText(`  <div>  a    b  </div>\n\n\n<div>c</div>  `)).toBe("a b\nc");
  });

  it("caps the output length with a marker", () => {
    const long = "<p>" + "x".repeat(HTML_TEXT_MAX + 500) + "</p>";
    const out = htmlToText(long);
    expect(out.length).toBeLessThanOrEqual(HTML_TEXT_MAX + 20);
    expect(out.endsWith("…[tronqué]")).toBe(true);
  });

  it("honours a custom max", () => {
    expect(htmlToText("<p>abcdefghij</p>", 4)).toBe("abcd\n…[tronqué]");
  });

  it("empty / tag-only input → empty string", () => {
    expect(htmlToText("")).toBe("");
    expect(htmlToText("<div></div><br>")).toBe("");
  });
});

describe("page chrome is dropped WHOLE (select/nav/footer/button)", () => {
  it("a region <select> and a <nav> link farm never reach the extract", () => {
    const html =
      "<html><body><nav><a>Accueil</a><a>Contact</a></nav>" +
      "<select><option>France</option><option>Germany</option></select>" +
      "<footer>Mentions légales</footer><button>Rechercher</button>" +
      "<main><h1>Résultats</h1><p>Rouen compte 114 083 habitants.</p></main></body></html>";
    const text = htmlToText(html);
    expect(text).toContain("114 083");
    expect(text).not.toContain("Germany");
    expect(text).not.toContain("Accueil");
    expect(text).not.toContain("Mentions légales");
    expect(text).not.toContain("Rechercher");
  });
});

describe("main-content extraction (<main>/<article> prioritaires)", () => {
  const filler = "<p>Contenu principal de l'article, riche et utile. </p>".repeat(20);
  it("un <main> substantiel exclut les barres latérales du budget", () => {
    const html = `<html><body><div class="sidebar">${"<p>Lien connexe promo.</p>".repeat(50)}</div><main>${filler}</main></body></html>`;
    const text = htmlToText(html);
    expect(text).toContain("Contenu principal");
    expect(text).not.toContain("Lien connexe");
  });
  it("un <main> COQUILLE VIDE retombe sur la page entière", () => {
    const html = `<html><body><main><div id="app"></div></main><p>Texte réel hors main, assez long pour compter comme contenu de page.</p></body></html>`;
    expect(htmlToText(html)).toContain("Texte réel hors main");
  });
});
