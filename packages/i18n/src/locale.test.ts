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

// La complétude — l'invariant que « entièrement traduite » désigne. `satisfies Messages`
// tient déjà les clés au compilateur ; ce test tient les VALEURS : aucune entrée vide, et
// aucune langue qui aurait la forme sans le fond. Il compare la FORME de chaque catalogue
// à celle du français (la source), récursivement.
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
          // Une entrée à variable : on l'appelle avec un échantillon pour la voir rendre.
          const out = (v as (x: unknown) => unknown)(1);
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
