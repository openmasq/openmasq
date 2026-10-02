import { afterEach, describe, expect, it, vi } from "vitest";

// `app.getLocale()` is the OS language; mutable so each case picks one.
const os = { locale: "fr-FR" };
vi.mock("electron", () => ({ app: { getLocale: () => os.locale } }));

import { _resetMainLocale, mainLocale, mainMessages, setMainLocale } from "./i18n";

afterEach(() => {
  _resetMainLocale();
  os.locale = "fr-FR";
});

describe("main's language: the user's choice, else the OS, else English", () => {
  it("before any choice, follows the OS language", () => {
    expect(mainLocale()).toBe("fr");
    os.locale = "en-GB";
    expect(mainLocale()).toBe("en");
  });

  it("an OS language the app does not ship falls back to English", () => {
    os.locale = "de-DE";
    expect(mainLocale()).toBe("en");
  });

  it("the user's choice wins over the OS", () => {
    expect(setMainLocale("en")).toBe(true);
    expect(mainLocale()).toBe("en");
    expect(mainMessages().desktopMain.contextMenu.copy).toBe("Copy");
  });
});

describe("app:set-locale validation (the renderer is untrusted)", () => {
  it("refuses anything that is not exactly a shipped locale, and keeps the current one", () => {
    setMainLocale("en");
    for (const bad of ["de", "EN", "en-US", "", "__proto__", "constructor", 42, null, undefined, { toString: () => "fr" }, ["fr"]]) {
      expect(setMainLocale(bad)).toBe(false);
      expect(mainLocale()).toBe("en");
    }
  });

  it("accepts each shipped locale", () => {
    expect(setMainLocale("fr")).toBe(true);
    expect(mainLocale()).toBe("fr");
  });
});
