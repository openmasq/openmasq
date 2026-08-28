import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  hostLocale,
  initialLocale,
  loadDeviceLocale,
  LOCALE_KEY,
  saveDeviceLocale,
} from "./locale";

// La LANGUE est une préférence d'APPAREIL, comme le thème : une clé localStorage non
// scopée, lue avant que l'auth ait résolu. Ces tests tiennent l'ordre du repli — appareil
// → hôte → défaut — et le fait qu'une valeur illisible ne fait jamais planter (fail-safe).
// Le runtime de test n'expose pas de localStorage persistant — on en pose un, adossé à
// une Map, pour que ces cas soient hermétiques (l'app, elle, tolère son absence : save
// et load sont enveloppés de try/catch).
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
    // 1. l'appareil gagne
    saveDeviceLocale("en");
    vi.spyOn(globalThis, "navigator", "get").mockReturnValue({ language: "fr-FR" } as Navigator);
    expect(initialLocale()).toBe("en");

    // 2. sans appareil, l'hôte décide
    localStorage.clear();
    expect(initialLocale()).toBe("fr");

    // 3. sans appareil ni hôte connu, le défaut (français)
    vi.spyOn(globalThis, "navigator", "get").mockReturnValue({ language: "de-DE" } as Navigator);
    expect(initialLocale()).toBe("fr");
  });
});
