import { describe, it, expect } from "vitest";
import { promptCacheKey } from "./promptCache";
import type { ChatMessage } from "./types";

const sys: ChatMessage = { role: "system", content: "Tu es un assistant. Règles: …" };
const u1: ChatMessage = { role: "user", content: "Bonjour" };
const a1: ChatMessage = { role: "assistant", content: "Salut !" };
const u2: ChatMessage = { role: "user", content: "Encore une question" };

describe("promptCacheKey", () => {
  it("returns a key ONLY for openai + mistral (never platform/compat/other)", () => {
    expect(promptCacheKey("openai", "gpt-5.5", [sys, u1])).toBeTruthy();
    expect(promptCacheKey("mistral", "mistral-large-2512", [sys, u1])).toBeTruthy();
    for (const p of ["scaleway", "openrouter", "openai-compat", "anthropic", "google"] as const) {
      expect(promptCacheKey(p, "m", [sys, u1])).toBeUndefined();
    }
  });

  it("is STABLE across turns of the same conversation (prefix grows by suffix)", () => {
    const turn1 = promptCacheKey("openai", "gpt-5.5", [sys, u1]);
    const turn2 = promptCacheKey("openai", "gpt-5.5", [sys, u1, a1, u2]); // same head, more history
    expect(turn2).toBe(turn1);
  });

  it("changes when the offered tool set changes (prefix would differ)", () => {
    const withA = promptCacheKey("openai", "gpt-5.5", [sys, u1], ["canva__search", "browser__navigate"]);
    const withB = promptCacheKey("openai", "gpt-5.5", [sys, u1], ["canva__search"]);
    const none = promptCacheKey("openai", "gpt-5.5", [sys, u1]);
    expect(withA).not.toBe(withB);
    expect(withA).not.toBe(none);
  });

  it("is order-insensitive on tool names (same set → same key)", () => {
    const k1 = promptCacheKey("openai", "gpt-5.5", [sys, u1], ["b", "a", "c"]);
    const k2 = promptCacheKey("openai", "gpt-5.5", [sys, u1], ["c", "b", "a"]);
    expect(k1).toBe(k2);
  });

  it("differs per model + per system prompt", () => {
    const base = promptCacheKey("openai", "gpt-5.5", [sys, u1]);
    expect(promptCacheKey("openai", "gpt-5.4", [sys, u1])).not.toBe(base);
    expect(promptCacheKey("openai", "gpt-5.5", [{ role: "system", content: "Autre prompt" }, u1])).not.toBe(base);
  });

  it("emits only an opaque hash — no message content leaks into the key", () => {
    const secretish: ChatMessage = { role: "system", content: "SECRET-MARKER-12345" };
    const key = promptCacheKey("openai", "gpt-5.5", [secretish, u1])!;
    expect(key).toMatch(/^kv_[a-z0-9]+$/);
    expect(key).not.toContain("SECRET-MARKER");
  });
});
