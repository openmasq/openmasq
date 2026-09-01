import { describe, it, expect } from "vitest";
import {
  conversationUsage,
  usageByModel,
  hasUsage,
  countUnbilled,
  countEstimated,
  formatTokens,
} from "./usage";
import type { Conversation, Message } from "../../types";

const msg = (
  id: string,
  role: Message["role"],
  usage?: Message["usage"],
): Message => ({ id, role, content: "x", usage });

const conv = (id: string, messages: Message[]): Conversation => ({
  id,
  title: id,
  modelId: "gpt-4o-mini",
  messages,
  createdAt: 0,
  updatedAt: 0,
});

describe("conversationUsage", () => {
  it("sums input/output over messages with usage, ignoring the rest", () => {
    const c = conv("a", [
      msg("u1", "user"),
      msg("a1", "assistant", { model: "gpt-4o-mini", inputTokens: 100, outputTokens: 40 }),
      msg("u2", "user"),
      msg("a2", "assistant", { model: "gpt-4o-mini", inputTokens: 200, outputTokens: 60 }),
    ]);
    expect(conversationUsage(c)).toEqual({
      inputTokens: 300,
      outputTokens: 100,
      total: 400,
    });
    expect(hasUsage(c)).toBe(true);
  });

  it("is zero (and hasUsage false) when nothing was recorded", () => {
    const c = conv("b", [msg("u1", "user"), msg("a1", "assistant")]);
    expect(conversationUsage(c)).toEqual({ inputTokens: 0, outputTokens: 0, total: 0 });
    expect(hasUsage(c)).toBe(false);
  });
});

describe("usageByModel", () => {
  it("rolls up per model across conversations, sorted by total desc", () => {
    const rows = usageByModel([
      conv("a", [
        msg("a1", "assistant", { model: "gpt-4o-mini", inputTokens: 100, outputTokens: 50 }),
        msg("a2", "assistant", { model: "claude-opus-4-8", inputTokens: 1000, outputTokens: 800 }),
      ]),
      conv("b", [
        msg("b1", "assistant", { model: "gpt-4o-mini", inputTokens: 10, outputTokens: 5 }),
      ]),
    ]);
    expect(rows).toHaveLength(2);
    // claude (1800) before gpt (165)
    expect(rows[0].model).toBe("claude-opus-4-8");
    expect(rows[0].total).toBe(1800);
    expect(rows[0].messages).toBe(1);
    const gpt = rows[1];
    expect(gpt.model).toBe("gpt-4o-mini");
    expect(gpt.inputTokens).toBe(110);
    expect(gpt.outputTokens).toBe(55);
    expect(gpt.total).toBe(165);
    expect(gpt.messages).toBe(2);
  });

  it("returns [] when no usage anywhere", () => {
    expect(usageByModel([conv("a", [msg("u1", "user")])])).toEqual([]);
  });
});

describe("usageByModel — billing filter", () => {
  const data = [
    conv("a", [
      msg("byo1", "assistant", { model: "gpt-4o-mini", inputTokens: 100, outputTokens: 0, billed: "byo" }),
      msg("sub1", "assistant", { model: "gpt-4o-mini", inputTokens: 200, outputTokens: 0, billed: "subscription" }),
      // legacy turn with no `billed` — counts only under "all"
      msg("old1", "assistant", { model: "gpt-4o-mini", inputTokens: 50, outputTokens: 0 }),
    ]),
  ];

  it('"all" counts every turn incl. unattributed', () => {
    const [row] = usageByModel(data, "all");
    expect(row.messages).toBe(3);
    expect(row.total).toBe(350);
  });

  it('"byo" counts only own-key turns', () => {
    const [row] = usageByModel(data, "byo");
    expect(row.messages).toBe(1);
    expect(row.total).toBe(100);
  });

  it('"subscription" counts only gateway turns', () => {
    const [row] = usageByModel(data, "subscription");
    expect(row.messages).toBe(1);
    expect(row.total).toBe(200);
  });

  it("countUnbilled counts turns with usage but no billing attribution", () => {
    expect(countUnbilled(data)).toBe(1);
    expect(countUnbilled([conv("z", [msg("u", "user")])])).toBe(0);
  });
});

describe("countEstimated — un tour interrompu compte, ET se dit estimé", () => {
  const c = conv("e", [
    msg("a1", "assistant", {
      model: "gpt-4o-mini", inputTokens: 100, outputTokens: 40, billed: "byo",
    }),
    msg("a2", "assistant", {
      model: "gpt-4o-mini", inputTokens: 300, outputTokens: 20,
      billed: "subscription", estimated: true,
    }),
  ]);

  it("l'estimation entre dans les totaux — l'ignorer serait revenir au zéro d'avant", () => {
    expect(conversationUsage(c).total).toBe(460);
  });

  it("les compte, et respecte le filtre de facturation", () => {
    expect(countEstimated([c])).toBe(1);
    expect(countEstimated([c], "subscription")).toBe(1);
    expect(countEstimated([c], "byo")).toBe(0);
  });

  it("un tour MESURÉ n'est jamais annoncé comme estimé", () => {
    const measured = conv("m", [
      msg("a1", "assistant", { model: "gpt-4o-mini", inputTokens: 10, outputTokens: 5 }),
    ]);
    expect(countEstimated([measured])).toBe(0);
  });
});

describe("formatTokens", () => {
  it("groupe les milliers avec une espace fine insécable", () => {
    expect(formatTokens(178115)).toBe("178\u202f115");
  });

  // The Usage panel sums the usage blob of EVERY message; it only takes an import or
  // a turn from an older schema for a field to be missing and the total to become
  // NaN. A « NaN » in a 38px display is not a counter, it's a displayed bug —
  // and the app states its failures, it doesn't dress them up.
  it("dit « — » plutôt que NaN quand le total n'est pas un nombre fini", () => {
    expect(formatTokens(Number.NaN)).toBe("—");
    expect(formatTokens(Number.POSITIVE_INFINITY)).toBe("—");
  });
});
