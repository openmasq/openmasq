import { describe, it, expect } from "vitest";
import { redactEngineSig } from "./redactEngineSig";
import type { Settings } from "../../types";

const s = (over: Partial<Settings> = {}): Settings =>
  ({ redactEngine: "patterns", redactCategories: {}, ...over }) as Settings;

describe("redactEngineSig", () => {
  it("falls back to the regex engine + empty categories with no settings", () => {
    expect(redactEngineSig(undefined)).toBe("règles locales#{}|");
  });

  it("names each engine", () => {
    expect(redactEngineSig(s({ redactEngine: "remote" }))).toMatch(/^cloud \(Scaleway\)#/);
    expect(redactEngineSig(s({ redactEngine: "local" }))).toMatch(/^IA locale \(BERT NER\)#/);
    expect(redactEngineSig(s({ redactEngine: "patterns" }))).toMatch(/^règles locales#/);
    expect(
      redactEngineSig(s({ redactEngine: "model", redactProvider: "openai", redactModelName: "gpt-4o" } as Partial<Settings>)),
    ).toMatch(/^IA \(openai · gpt-4o\)#/);
  });

  it("changes when a category toggle changes (so a stale file is re-detected)", () => {
    const a = redactEngineSig(s({ redactCategories: { name: true } as Settings["redactCategories"] }));
    const b = redactEngineSig(s({ redactCategories: { name: false } as Settings["redactCategories"] }));
    expect(a).not.toBe(b);
  });

  it("changes when the numbers toggle changes", () => {
    expect(redactEngineSig(s({ redactNumbers: true }))).not.toBe(redactEngineSig(s({ redactNumbers: false })));
  });

  it("changes when a conversation override changes (so a doc redacted under the OLD 'cette conversation' rules goes stale)", () => {
    const base = s({ redactCategories: { email: true } as Settings["redactCategories"] });
    const a = redactEngineSig(base, undefined, { email: false });
    const b = redactEngineSig(base, undefined, { email: true });
    const noOverride = redactEngineSig(base, undefined, undefined);
    expect(a).not.toBe(b);
    expect(b).toBe(noOverride); // conv override merges the SAME as the equivalent global value
  });
});
