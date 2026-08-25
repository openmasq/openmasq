import { describe, it, expect } from "vitest";
import {
  PDF_CSP,
  PDF_DOC_URL,
  PDF_WEB_PREFERENCES,
  MAX_DOC_HTML_BYTES,
  MAX_PENDING_RENDERS,
  canAdmitRender,
  escapeHtml,
  isPdfDocUrl,
  isPdfResourceAllowed,
  pdfFontFaceCss,
  pdfFooterTemplate,
  pdfSkeleton,
  validatePdfRequest,
} from "./pdfSkeleton";

/**
 * The print page is built from RENDERER-supplied markup and carries the user's REAL
 * un-redacted data. Its containment is a set of enumerated permissions, so each one is
 * pinned here — a future edit that relaxes any of them turns this file red.
 */
describe("HTML→PDF isolation policy", () => {
  it("denies everything by default and permits only inline style + data: font/image", () => {
    expect(PDF_CSP).toMatch(/^default-src 'none'/);
    expect(PDF_CSP).toContain("font-src data:");
    expect(PDF_CSP).toContain("img-src data:");
    expect(PDF_CSP).toContain("base-uri 'none'");
    // No host, no scheme that can reach the network or the disk, ever.
    expect(PDF_CSP).not.toMatch(/https?:|\*|'self'|file:/);
    // Style is the ONE thing that may be inline; script must not be.
    expect(PDF_CSP).toContain("style-src 'unsafe-inline'");
    expect(PDF_CSP).not.toMatch(/script-src[^;]*unsafe/);
  });

  it("runs the print window with no script, no node, no bridge", () => {
    expect(PDF_WEB_PREFERENCES.javascript).toBe(false);
    expect(PDF_WEB_PREFERENCES.sandbox).toBe(true);
    expect(PDF_WEB_PREFERENCES.contextIsolation).toBe(true);
    expect(PDF_WEB_PREFERENCES.nodeIntegration).toBe(false);
    expect(PDF_WEB_PREFERENCES.nodeIntegrationInSubFrames).toBe(false);
    expect(PDF_WEB_PREFERENCES.webviewTag).toBe(false);
    expect(PDF_WEB_PREFERENCES.webSecurity).toBe(true);
    // A preload would hand `window.openmasq` to a page built from model-authored text.
    expect("preload" in PDF_WEB_PREFERENCES).toBe(false);
  });

  it("serves exactly one URL and allows no other request", () => {
    expect(isPdfDocUrl(PDF_DOC_URL)).toBe(true);
    for (const url of [
      "kvpdf://doc/other.html",
      "kvpdf://evil/index.html",
      "https://attacker.tld/x.png",
      "http://127.0.0.1:1/x",
      "file:///etc/passwd",
      "kvpdf://doc/index.html?x=1",
    ]) {
      expect(isPdfDocUrl(url), url).toBe(false);
    }
    // The request filter additionally lets `data:` through (inert, already in the doc)
    // — and NOTHING else, including a meta-refresh navigation, which CSP never covers.
    expect(isPdfResourceAllowed("data:image/png;base64,AA")).toBe(true);
    expect(isPdfResourceAllowed(PDF_DOC_URL)).toBe(true);
    expect(isPdfResourceAllowed("https://attacker.tld/beacon?d=real-name")).toBe(false);
    expect(isPdfResourceAllowed("file:///Users/x/.ssh/id_rsa")).toBe(false);
  });
});

describe("payload validation — fail closed", () => {
  it("refuses a non-string, an oversize document and a style-tag escape", () => {
    expect(() => validatePdfRequest(null)).toThrow();
    expect(() => validatePdfRequest({ html: 1, css: "" })).toThrow();
    expect(() => validatePdfRequest({ html: "x", css: 2 })).toThrow();
    expect(() => validatePdfRequest({ html: "x".repeat(MAX_DOC_HTML_BYTES + 1), css: "" })).toThrow();
    // A closing style tag in the CSS would end our <style> and make the rest markup.
    expect(() => validatePdfRequest({ html: "", css: "</style><b>x" })).toThrow();
    expect(() => validatePdfRequest({ html: "", css: "</ STYLE >" })).toThrow();
  });

  it("bounds the render queue — a renderer must not pile up main-side payloads", () => {
    expect(canAdmitRender(0)).toBe(true);
    expect(canAdmitRender(MAX_PENDING_RENDERS - 1)).toBe(true);
    expect(canAdmitRender(MAX_PENDING_RENDERS)).toBe(false);
    expect(canAdmitRender(9_999)).toBe(false);
  });

  it("defaults a missing title and caps it", () => {
    expect(validatePdfRequest({ html: "", css: "" }).title).toBe("Document");
    expect(validatePdfRequest({ html: "", css: "", title: "t".repeat(999) }).title.length).toBe(300);
  });
});

describe("skeleton", () => {
  it("escapes the title in the document AND in the print footer", () => {
    const nasty = '</title><script>fetch("//evil")</script>';
    const html = pdfSkeleton({ html: "<p>x</p>", css: "p{}", title: nasty }, "");
    expect(html).not.toContain("<script>");
    expect(html).toContain(escapeHtml(nasty));
    // The footer template renders in Chromium's own frame, outside our CSP.
    const footer = pdfFooterTemplate(nasty);
    expect(footer).not.toContain("<script>");
    expect(footer).toContain('class="pageNumber"');
  });

  it("inlines the brand font as data:, and degrades to no @font-face when absent", () => {
    expect(pdfFontFaceCss("QUJD")).toContain("url(data:font/ttf;base64,QUJD)");
    expect(pdfFontFaceCss("QUJD")).toContain("font-weight:300 700");
    expect(pdfFontFaceCss(undefined)).toBe("");
    // The font face precedes the document CSS so the document can override nothing of it.
    const html = pdfSkeleton({ html: "", css: "body{color:red}", title: "T" }, "@font-face{}");
    expect(html.indexOf("@font-face{}")).toBeLessThan(html.indexOf("body{color:red}"));
  });
});
