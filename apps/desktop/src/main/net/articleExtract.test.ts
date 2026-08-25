import { describe, expect, it } from "vitest";
import { extractArticle } from "./articleExtract";

const PARA = "<p>Un paragraphe de contenu rédactionnel utile, assez long pour peser dans le score de lisibilité de la page.</p>";

describe("extractArticle — étage Readability, fail-closed", () => {
  it("extrait un ARTICLE en lâchant le boilerplate (partage, connexes, cookies)", () => {
    const html =
      `<html><body><div class="cookie-banner"><p>Nous utilisons des cookies pour améliorer votre expérience.</p></div>` +
      `<div id="content"><article><h1>Titre de l'article</h1>${PARA.repeat(20)}</article></div>` +
      `<aside class="sidebar related" role="complementary"><h2>Articles connexes</h2><ul>${"<li><a href='/autre'>Lire aussi : autre sujet promotionnel.</a></li>".repeat(10)}</ul></aside></body></html>`;
    const text = extractArticle(html, 20_000);
    expect(text).toBeTruthy();
    expect(text).toContain("contenu rédactionnel");
    expect(text).not.toContain("Articles connexes");
    expect(text).not.toContain("cookies");
  });
  it("retourne null sur une page NON-article (le scan chaîne prend le relais)", () => {
    const listing = `<html><body><ul>${"<li><a href='#'>Résultat</a> — extrait court.</li>".repeat(30)}</ul></body></html>`;
    expect(extractArticle(listing, 20_000)).toBeNull();
    expect(extractArticle("", 20_000)).toBeNull();
    expect(extractArticle("<html><body><main></main></body></html>", 20_000)).toBeNull();
  });
  it("respecte le cap avec le marqueur de troncature", () => {
    const html = `<html><body><article><h1>T</h1>${PARA.repeat(200)}</article></body></html>`;
    const text = extractArticle(html, 1_000)!;
    expect(text.length).toBeLessThan(1_050);
    expect(text).toContain("…[tronqué]");
  });
});
