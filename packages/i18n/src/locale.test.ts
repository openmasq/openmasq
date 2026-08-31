import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOCALE,
  getMessages,
  isLocale,
  LOCALES,
  MESSAGES,
  resolveLocale,
} from "./locale";
import type { Messages } from "./messages";

describe("résolution de locale", () => {
  it("ramène une étiquette régionale à sa langue", () => {
    expect(resolveLocale("fr-FR")).toBe("fr");
    expect(resolveLocale("en-GB")).toBe("en");
    expect(resolveLocale("fr_CA")).toBe("fr");
    expect(resolveLocale("EN")).toBe("en");
  });

  it("rend null sur une langue non livrée — le repli est au caller, pas caché ici", () => {
    expect(resolveLocale("de")).toBeNull();
    expect(resolveLocale("")).toBeNull();
    expect(resolveLocale(undefined)).toBeNull();
    expect(resolveLocale(null)).toBeNull();
  });

  it("isLocale garde l'union", () => {
    expect(isLocale("fr")).toBe(true);
    expect(isLocale("en")).toBe(true);
    expect(isLocale("de")).toBe(false);
    expect(isLocale(42)).toBe(false);
  });

  it("getMessages retombe sur le défaut pour une locale hors union (fail-safe)", () => {
    expect(getMessages("zz" as never)).toBe(MESSAGES[DEFAULT_LOCALE]);
  });
});

// Completeness — the invariant « fully translated » names. `satisfies Messages`
// already holds the keys for the compiler; this test holds the VALUES: no empty entry, and
// no language with the shape but not the substance. It compares each catalogue's SHAPE
// with the French one (the source), recursively.
describe("complétude des catalogues (chaque langue livrée est entière)", () => {
  const shape = (o: unknown): string[] => {
    const out: string[] = [];
    const walk = (v: unknown, path: string) => {
      if (v && typeof v === "object") {
        for (const k of Object.keys(v as Record<string, unknown>))
          walk((v as Record<string, unknown>)[k], path ? `${path}.${k}` : k);
      } else {
        out.push(`${path}:${typeof v}`);
      }
    };
    walk(o, "");
    return out.sort();
  };

  const reference = shape(MESSAGES[DEFAULT_LOCALE]);

  for (const locale of LOCALES) {
    it(`${locale} : mêmes clés et mêmes types que la source`, () => {
      expect(shape(MESSAGES[locale])).toEqual(reference);
    });

    it(`${locale} : aucune chaîne vide`, () => {
      const empties: string[] = [];
      const walk = (v: unknown, path: string) => {
        if (typeof v === "string") {
          if (!v.trim()) empties.push(path);
        } else if (typeof v === "function") {
          // An entry with a variable: we call it with a sample to see it render.
          // AS MANY arguments as it declares — an entry with two holes (« N caractères
          // · N lignes ») otherwise received `undefined` as the second, and the catalogue threw
          // from the very test meant to check it.
          const sample = Array.from({ length: Math.max(1, v.length) }, () => 1);
          const out = (v as (...a: unknown[]) => unknown)(...sample);
          if (typeof out === "string" && !out.trim()) empties.push(path);
        } else if (v && typeof v === "object") {
          for (const k of Object.keys(v as Record<string, unknown>))
            walk((v as Record<string, unknown>)[k], path ? `${path}.${k}` : k);
        }
      };
      walk(MESSAGES[locale], "");
      expect(empties).toEqual([]);
    });
  }

  it("le type Messages est bien celui exercé (garde-fou de compilation)", () => {
    const m: Messages = MESSAGES.fr;
    expect(m.nav.chats.length).toBeGreaterThan(0);
  });
});
