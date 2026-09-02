// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { applyPersistedTheme, loadDeviceTheme, readTheme, saveDeviceTheme, THEME_KEY } from "./theme";

/**
 * TWO themes, read TOLERANTLY.
 *
 * The product offers one switch (light / dark) and the stylesheet knows two grounds. An
 * earlier version persisted the accent inside the theme NAME (`blue`, `blue-dark`) — those
 * values still sit in device keys and settings blobs out there. Reading them as the ground
 * they meant is what keeps an existing install from snapping back to light on its next
 * start; refusing anything else is what keeps a stray value from reaching `data-theme`.
 */
afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

describe("readTheme — the persisted names an earlier version could write", () => {
  it("reads the two current names as themselves", () => {
    expect(readTheme("light")).toBe("light");
    expect(readTheme("dark")).toBe("dark");
  });

  it("reads the retired accent-bearing names as the ground they meant", () => {
    expect(readTheme("blue")).toBe("light");
    expect(readTheme("blue-dark")).toBe("dark");
  });

  it("answers undefined for anything else — the caller falls back", () => {
    for (const v of [undefined, null, "", "sepia", "DARK", 0, {}]) expect(readTheme(v)).toBeUndefined();
  });
});

describe("the device key and the pre-paint pass", () => {
  it("loads a retired device key as its ground", () => {
    localStorage.setItem(THEME_KEY, "blue-dark");
    expect(loadDeviceTheme()).toBe("dark");
  });

  it("writes only the current names back", () => {
    saveDeviceTheme("dark");
    expect(localStorage.getItem(THEME_KEY)).toBe("dark");
  });

  it("stamps `data-theme=\"dark\"` for dark, and NO attribute for light (the bare :root)", () => {
    localStorage.setItem(THEME_KEY, "blue-dark");
    applyPersistedTheme();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    localStorage.setItem(THEME_KEY, "blue");
    applyPersistedTheme();
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });
});
