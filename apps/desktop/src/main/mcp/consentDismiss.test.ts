// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { CONSENT_DISMISS_JS } from "./browser/consentDismiss";

/**
 * The consent-dismiss snippet runs in the agent browser's page world. Here we eval it
 * against DOM fixtures (jsdom) to pin WHICH element it clicks: the right consent button,
 * and — critically — never an unrelated page button.
 */

const clicks: string[] = [];
const origClick = HTMLElement.prototype.click;
const origRect = Element.prototype.getBoundingClientRect;

beforeEach(() => {
  clicks.length = 0;
  // Everything is "visible" by default so `vis()` passes; a test can shrink one element.
  Element.prototype.getBoundingClientRect = () => ({ width: 10, height: 10, top: 0, left: 0, right: 10, bottom: 10, x: 0, y: 0, toJSON() {} } as DOMRect);
  HTMLElement.prototype.click = function (this: HTMLElement) {
    clicks.push(this.id || this.getAttribute("class") || this.textContent?.trim() || "el");
  };
});
afterEach(() => {
  HTMLElement.prototype.click = origClick;
  Element.prototype.getBoundingClientRect = origRect;
  document.body.innerHTML = "";
});

const run = (): boolean => new Function("return " + CONSENT_DISMISS_JS)() as boolean;

describe("CONSENT_DISMISS_JS", () => {
  it("clicks a known consent-manager button (Didomi continue-without)", () => {
    document.body.innerHTML = `
      <div id="didomi-host"><button class="didomi-continue-without-agreeing">Continuer sans accepter</button>
      <button id="didomi-notice-agree-button">Tout accepter</button></div>`;
    expect(run()).toBe(true);
    expect(clicks).toEqual(["didomi-continue-without-agreeing"]); // reject/continue FIRST
  });

  it("prefers REJECT over ACCEPT when both are known (OneTrust)", () => {
    document.body.innerHTML = `
      <div id="onetrust-banner-sdk">
        <button id="onetrust-accept-btn-handler">Accept</button>
        <button id="onetrust-reject-all-handler">Reject</button>
      </div>`;
    expect(run()).toBe(true);
    expect(clicks).toEqual(["onetrust-reject-all-handler"]);
  });

  it("generic pass: clicks « Tout accepter » inside a consent dialog with no known id (Boursorama-like)", () => {
    document.body.innerHTML = `
      <div role="dialog" aria-label="Gestion du consentement des cookies">
        <button>Gérer mes cookies</button>
        <button>Tout accepter</button>
      </div>`;
    expect(run()).toBe(true);
    expect(clicks).toEqual(["Tout accepter"]);
  });

  it("does NOT click an unrelated page button (no consent container, or non-consent text)", () => {
    document.body.innerHTML = `
      <header><button id="subscribe">Accept our newsletter</button></header>
      <main><button id="buy">Accept all recommendations</button></main>
      <div class="cart"><button>Accept</button></div>`;
    expect(run()).toBe(false);
    expect(clicks).toEqual([]);
  });

  it("returns false (clicks nothing) when there is no banner at all", () => {
    document.body.innerHTML = `<main><p>Contenu</p></main>`;
    expect(run()).toBe(false);
    expect(clicks).toEqual([]);
  });

  it("skips an INVISIBLE consent button (0×0) rather than clicking a hidden trap", () => {
    document.body.innerHTML = `<div id="cookie-x"><button id="hidden-accept">Tout accepter</button></div>`;
    const el = document.getElementById("hidden-accept")!;
    el.getBoundingClientRect = () => ({ width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON() {} }) as DOMRect;
    expect(run()).toBe(false);
    expect(clicks).toEqual([]);
  });
});
