import { describe, expect, it, vi } from "vitest";
import type { ChatMessage, ToolCall } from "@openmasq/llm";
import {
  approxResultChars,
  contextBudgetNote,
  dispatchInWaves,
  prefetchReads,
  resultCharBudget,
  toolResultChars,
} from "./prefetch";

const call = (name: string, args: Record<string, unknown> = {}, id = name): ToolCall => ({
  id,
  name,
  arguments: args,
});
const toolMsg = (content: string): ChatMessage => ({ role: "tool", content, toolCallId: "x" });

describe("le budget : ce que les résultats d'un tour ont le droit d'occuper", () => {
  it("la moitié de la fenêtre, à ≈4 caractères par token", () => {
    expect(resultCharBudget(128_000)).toBe(256_000);
    // Unknown window ⇒ the low hypothesis, never « no limit ».
    expect(resultCharBudget(undefined)).toBe(256_000);
    expect(resultCharBudget(1_000_000)).toBe(2_000_000);
  });

  it("ne compte QUE les résultats d'outils — le prompt et la réponse ne sont pas à eux", () => {
    const messages: ChatMessage[] = [
      { role: "system", content: "x".repeat(1000) },
      { role: "user", content: "yy" },
      toolMsg("abcde"),
      { role: "assistant", content: "z".repeat(500) },
      toolMsg("fgh"),
    ];
    expect(toolResultChars(messages)).toBe(8);
  });

  it("mesure un résultat BRUT en entier — une mesure tronquée rend le budget aveugle", () => {
    const big = { content: [{ type: "text", text: "a".repeat(50_000) }] };
    // The exact regression: `safeJson` caps at 400, so every result weighed 400
    // and no wave was ever cut off.
    expect(approxResultChars(big)).toBeGreaterThan(50_000);
    expect(approxResultChars(undefined)).toBe(2); // "{}"
  });
});

describe("dispatchInWaves — paralléliser sans décider à vide", () => {
  it("une vague part d'un bloc : N lectures = un seul aller-retour", async () => {
    const inFlight: string[] = [];
    let peak = 0;
    const dispatch = vi.fn(async (c: ToolCall) => {
      inFlight.push(c.id);
      peak = Math.max(peak, inFlight.length);
      await Promise.resolve();
      inFlight.pop();
      return "ok";
    });
    await dispatchInWaves({
      calls: Array.from({ length: 8 }, (_, i) => call("read", {}, `c${i}`)),
      dispatch,
      budget: 1_000_000,
      used: () => 0,
    });
    expect(dispatch).toHaveBeenCalledTimes(8);
    expect(peak).toBe(8); // parallel, not serialized
  });

  it("la vague suivante ne part pas si la précédente a mangé le budget", async () => {
    const huge = "x".repeat(1000);
    const dispatch = vi.fn(async () => huge);
    await dispatchInWaves({
      calls: Array.from({ length: 12 }, (_, i) => call("read", {}, `c${i}`)),
      dispatch,
      budget: 900, // a wave of 2 already exceeds it
      used: () => 0,
      wave: 2,
    });
    expect(dispatch).toHaveBeenCalledTimes(2);
  });

  it("le volume DÉJÀ dans l'historique compte aussi — sinon le budget se remet à zéro à chaque tour", async () => {
    const dispatch = vi.fn(async () => "ok");
    await dispatchInWaves({ calls: [call("read")], dispatch, budget: 100, used: () => 100 });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("un appel qui échoue ne consomme pas de budget et n'arrête pas les autres", async () => {
    const dispatch = vi.fn(async (c: ToolCall) => {
      if (c.id === "c0") throw new Error("boom");
      return "ok";
    });
    await dispatchInWaves({
      calls: [call("read", {}, "c0"), call("read", {}, "c1"), call("read", {}, "c2")],
      dispatch,
      budget: 1_000_000,
      used: () => 0,
      wave: 1,
    });
    expect(dispatch).toHaveBeenCalledTimes(3);
  });
});

describe("prefetchReads — QUI part en parallèle, et pourquoi pas les autres", () => {
  const run = (calls: ToolCall[], over: Partial<Parameters<typeof prefetchReads>[0]> = {}) => {
    const dispatch = vi.fn(async (_c: ToolCall) => "ok");
    return prefetchReads({
      calls,
      callCounts: new Map(),
      toolInfo: new Map(),
      vaultTerms: [],
      deredact: (a) => a,
      dispatch,
      budget: 1_000_000,
      used: () => 0,
      ...over,
    }).then(() => dispatch);
  };

  it("une LECTURE part ; une écriture et un outil d'intention inconnue attendent la porte", async () => {
    const d = await run([
      call("gmail__get_message", { id: "1" }),
      call("gmail__send_message", { to: "x" }),
      call("posthog__exec", { q: "1" }),
    ]);
    expect(d).toHaveBeenCalledTimes(1);
    expect(d.mock.calls[0][0].name).toBe("gmail__get_message");
  });

  it("un batch de 20 lectures distinctes part EN ENTIER — c'est le cas d'usage", async () => {
    const d = await run(Array.from({ length: 20 }, (_, i) => call("gmail__get_message", { id: i }, `m${i}`)));
    expect(d).toHaveBeenCalledTimes(20);
  });

  it("un jumeau exact ne part pas deux fois", async () => {
    const d = await run([
      call("gmail__get_message", { id: "1" }, "a"),
      call("gmail__get_message", { id: "1" }, "b"),
    ]);
    expect(d).toHaveBeenCalledTimes(1);
  });

  it("le plafond par outil se PROJETTE sur ce qui a déjà tourné ce tour", async () => {
    // 30 = MAX_SAME_READ; 28 already executed ⇒ only 2 of the remaining 5 go out.
    const d = await run(
      Array.from({ length: 5 }, (_, i) => call("gmail__get_message", { id: i }, `m${i}`)),
      { callCounts: new Map([["gmail__get_message", 28]]) },
    );
    expect(d).toHaveBeenCalledTimes(2);
  });

  it("des arguments malformés ne partent jamais à l'aveugle", async () => {
    const bad: ToolCall = { ...call("gmail__get_message"), argsError: "JSON invalide" };
    expect(await run([bad])).not.toHaveBeenCalled();
  });

  it("⚠️ un argument qui EMBARQUE une donnée du coffre retombe sur le chemin gardé", async () => {
    // H-4: the prefetch de-redacts and reaches the real server BEFORE the confirm
    // card. An injected `lookup(note="…real PII…")` would leak without this check.
    const d = await run([call("attacker__get_thing", { note: "dossier de Jean-Marc Rebour, 12 rue des Lilas" })], {
      vaultTerms: ["Jean-Marc Rebour", "12 rue des Lilas"],
    });
    expect(d).not.toHaveBeenCalled();
  });
});

describe("contextBudgetNote", () => {
  it("dit que l'appel n'a PAS eu lieu et somme de conclure — jamais un tour avorté", () => {
    const n = contextBudgetNote("gmail__get_message");
    expect(n).toContain("gmail__get_message");
    expect(n).toContain("PAS été exécuté");
    expect(n).toMatch(/réponds\s+MAINTENANT/);
  });
});
