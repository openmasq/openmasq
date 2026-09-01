import { beforeEach, describe, expect, it } from "vitest";
import { claudeAccount, noteClaudeRateLimit, parseAgyModels, parseCodexAccount, resetClaudeAccountForTests } from "./account";

// Real captures, 01/09/2026 — the shapes this module was written against.
const RATE_LIMITS = {
  rateLimits: {
    limitId: "codex",
    primary: { usedPercent: 37, windowDurationMins: 43200, resetsAt: 1790351443 },
    secondary: null,
    credits: { hasCredits: false, unlimited: false, balance: null },
    planType: "free",
  },
};
const MODELS = {
  data: [
    { id: "gpt-5.6-terra", displayName: "GPT-5.6-Terra", hidden: false, isDefault: true },
    { id: "gpt-5.6-luna", displayName: "GPT-5.6-Luna", hidden: false, isDefault: false },
    { id: "gpt-5.6-secret", displayName: "Hidden", hidden: true },
  ],
};
const ACCOUNT = { account: { type: "chatgpt", email: "x@y", planType: "free" }, requiresOpenaiAuth: true };

describe("parseCodexAccount — les trois lectures de l'app-server, une fiche", () => {
  it("garde l'offre, la fenêtre en MILLISECONDES, et les modèles visibles avec leur défaut", () => {
    const a = parseCodexAccount(RATE_LIMITS, MODELS, ACCOUNT);
    expect(a.cli).toBe("codex");
    expect(a.plan).toBe("free");
    expect(a.quotas).toEqual([
      { window: "primary", usedPercent: 37, windowMinutes: 43200, resetsAt: 1790351443_000 },
    ]);
    expect(a.models).toEqual([
      { id: "gpt-5.6-terra", label: "GPT-5.6-Terra", isDefault: true },
      { id: "gpt-5.6-luna", label: "GPT-5.6-Luna" },
    ]);
    expect(a.source).toBe("live");
    // The e-mail the CLI returns is NEVER copied into the sheet: the renderer has no
    // use for it, and a sheet is something that gets logged.
    expect(JSON.stringify(a)).not.toContain("x@y");
  });

  it("survit à des réponses manquantes ou en erreur (undefined) — fiche vide, pas d'exception", () => {
    const a = parseCodexAccount(undefined, undefined, undefined);
    expect(a.quotas).toEqual([]);
    expect(a.models).toEqual([]);
    expect(a.plan).toBeUndefined();
  });
});

describe("parseAgyModels — la sortie TSV de `agy models`", () => {
  it("saute la bannière et garde id + libellé", () => {
    const out = "Fetching available models...\ngemini-3.7-flash-high\tGemini 3.7 Flash (High)\nclaude-sonnet-4-6\tClaude Sonnet 4.6 (Thinking)\n";
    expect(parseAgyModels(out)).toEqual([
      { id: "gemini-3.7-flash-high", label: "Gemini 3.7 Flash (High)" },
      { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 (Thinking)" },
    ]);
  });
  it("une sortie sans tableau (CLI non connectée) ⇒ aucun modèle", () => {
    expect(parseAgyModels("You are not logged into Antigravity.\n")).toEqual([]);
  });
});

describe("claudeAccount — ce que le dernier tour a annoncé", () => {
  beforeEach(resetClaudeAccountForTests);
  it("rien avant un premier tour", () => {
    expect(claudeAccount()).toBeNull();
  });
  it("mémorise le dernier rate_limit_event, secondes → millisecondes, source lastTurn", () => {
    noteClaudeRateLimit({ status: "allowed_warning", resetsAt: 1787608800, windowType: "five_hour" });
    const a = claudeAccount();
    expect(a?.source).toBe("lastTurn");
    expect(a?.quotas).toEqual([{ window: "five_hour", status: "allowed_warning", resetsAt: 1787608800_000 }]);
  });
});
