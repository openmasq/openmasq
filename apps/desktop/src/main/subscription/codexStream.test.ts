import { describe, expect, it } from "vitest";
import { codexErrorMessage, codexUsage, interpretCodexEvent } from "./codexStream";

// Formes MESURÉES le 26/08/2026 (captures réelles, codex-cli 0.149.1).
describe("interpretCodexEvent", () => {
  it("thread.started → session", () => {
    expect(interpretCodexEvent({ type: "thread.started", thread_id: "01a03ec3" })).toEqual({
      kind: "session",
      id: "01a03ec3",
    });
  });

  it("item.completed/agent_message → le texte (la 0.149.1 n'émet aucun delta)", () => {
    expect(
      interpretCodexEvent({
        type: "item.completed",
        item: { id: "item_0", type: "agent_message", text: "PONG" },
      }),
    ).toEqual({ kind: "text", delta: "PONG" });
  });

  it("ignore turn.started, item.started et les items non-message (outils)", () => {
    expect(interpretCodexEvent({ type: "turn.started" })).toBeNull();
    expect(
      interpretCodexEvent({
        type: "item.started",
        item: { type: "command_execution", command: "/bin/zsh -lc ls" },
      }),
    ).toBeNull();
    for (const t of ["command_execution", "web_search", "reasoning"]) {
      expect(interpretCodexEvent({ type: "item.completed", item: { type: t } })).toBeNull();
    }
  });

  it("turn.completed → done ; usage OpenAI (input_tokens INCLUT le cache)", () => {
    expect(
      interpretCodexEvent({
        type: "turn.completed",
        usage: {
          input_tokens: 13555,
          cached_input_tokens: 9984,
          cache_write_input_tokens: 0,
          output_tokens: 6,
          reasoning_output_tokens: 0,
        },
      }),
    ).toEqual({
      kind: "done",
      usage: { inputTokens: 13555, outputTokens: 6, cachedInputTokens: 9984 },
      finish: "stop",
    });
  });

  it("turn.failed → erreur portée, jamais un « done » silencieux", () => {
    const a = interpretCodexEvent({
      type: "turn.failed",
      error: { message: "boom" },
    });
    expect(a).toEqual({ kind: "error", message: "boom" });
  });
});

describe("codexErrorMessage — l'API brute est DÉPLIÉE, jamais servie telle quelle", () => {
  it("extrait le message intérieur de l'enveloppe JSON (mesuré : modèle refusé)", () => {
    const raw =
      '{"type":"error","status":400,"error":{"type":"invalid_request_error","message":"The \'gpt-5.3-codex\' model is not supported when using Codex with a ChatGPT account."}}';
    expect(codexErrorMessage({ message: raw })).toBe(
      "The 'gpt-5.3-codex' model is not supported when using Codex with a ChatGPT account.",
    );
  });

  it("rend la chaîne telle quelle si ce n'est pas du JSON, et ne rend jamais vide", () => {
    expect(codexErrorMessage({ message: "quota épuisé" })).toBe("quota épuisé");
    expect(codexErrorMessage(undefined)).toMatch(/erreur/i);
    expect(codexErrorMessage({})).toMatch(/erreur/i);
  });
});

describe("codexUsage", () => {
  it("absent/malformé → undefined ; compteurs à 0 → champs omis", () => {
    expect(codexUsage(undefined)).toBeUndefined();
    expect(codexUsage({ reasoning_output_tokens: 3 })).toBeUndefined();
    expect(
      codexUsage({ input_tokens: 10, output_tokens: 2, cached_input_tokens: 0 }),
    ).toEqual({ inputTokens: 10, outputTokens: 2 });
  });

  it("porte l'écriture de cache quand elle existe", () => {
    expect(
      codexUsage({ input_tokens: 10, output_tokens: 2, cache_write_input_tokens: 4 }),
    ).toEqual({ inputTokens: 10, outputTokens: 2, cacheWriteInputTokens: 4 });
  });
});
