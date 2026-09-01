import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  hostLocale,
  initialLocale,
  loadDeviceLocale,
  LOCALE_KEY,
  saveDeviceLocale,
} from "./locale";

// LANGUAGE is a DEVICE preference, like the theme: an unscoped localStorage key,
// read before auth has resolved. These tests hold the fallback order — device
// → host → default — and the fact that an unreadable value never crashes (fail-safe).
// The test runtime doesn't expose a persistent localStorage — we install one, backed by
// a Map, so these cases stay hermetic (the app itself tolerates its absence: save
// and load are wrapped in try/catch).
function installLocalStorage(): Map<string, string> {
  const store = new Map<string, string>();
  const stub = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  };
  vi.stubGlobal("localStorage", stub);
  return store;
}

describe("langue d'appareil", () => {
  beforeEach(() => {
    installLocalStorage();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("enregistre puis relit une locale livrée", () => {
    saveDeviceLocale("en");
    expect(loadDeviceLocale()).toBe("en");
  });

  it("normalise une étiquette régionale à la lecture (via resolveLocale)", () => {
    localStorage.setItem(LOCALE_KEY, "en-GB");
    expect(loadDeviceLocale()).toBe("en");
  });

  it("rend null quand rien n'est enregistré", () => {
    expect(loadDeviceLocale()).toBeNull();
  });

  it("hostLocale ramène la langue du navigateur à une locale livrée", () => {
    vi.spyOn(globalThis, "navigator", "get").mockReturnValue({ language: "fr-CA" } as Navigator);
    expect(hostLocale()).toBe("fr");
  });

  it("initialLocale : appareil d'abord, puis hôte, puis défaut", () => {
    // 1. the device wins
    saveDeviceLocale("en");
    vi.spyOn(globalThis, "navigator", "get").mockReturnValue({ language: "fr-FR" } as Navigator);
    expect(initialLocale()).toBe("en");

    // 2. without a device, the host decides
    localStorage.clear();
    expect(initialLocale()).toBe("fr");

    // 3. with neither device nor known host, the default (French)
    vi.spyOn(globalThis, "navigator", "get").mockReturnValue({ language: "de-DE" } as Navigator);
    expect(initialLocale()).toBe("fr");
  });
});
