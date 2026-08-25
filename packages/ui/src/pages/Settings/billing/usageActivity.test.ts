import { describe, it, expect } from "vitest";
import { dailyModelMessages } from "./usageActivity";
import type { Conversation, Message } from "../../../types";

const now = Date.now();
const DAY = 86_400_000;

const msg = (id: string, at: number, usage?: Message["usage"]): Message => ({
  id,
  role: "assistant",
  content: "x",
  at,
  usage,
});

const conv = (id: string, messages: Message[], updatedAt = now): Conversation => ({
  id,
  title: id,
  modelId: "gpt-4o-mini",
  messages,
  createdAt: 0,
  updatedAt,
});

describe("dailyModelMessages", () => {
  it("buckets assistant turns by day and orders models by total desc", () => {
    const { days, models } = dailyModelMessages(
      [
        conv("a", [
          msg("t1", now, { model: "gpt-4o-mini", inputTokens: 1, outputTokens: 1, billed: "byo" }),
          msg("t2", now, { model: "gpt-4o-mini", inputTokens: 1, outputTokens: 1, billed: "byo" }),
          msg("t3", now, { model: "claude-opus-4-8", inputTokens: 1, outputTokens: 1, billed: "byo" }),
          msg("y1", now - DAY, { model: "gpt-4o-mini", inputTokens: 1, outputTokens: 1, billed: "byo" }),
        ]),
      ],
      14,
    );
    // gpt (3) before claude (1)
    expect(models).toEqual(["gpt-4o-mini", "claude-opus-4-8"]);
    const today = days[days.length - 1];
    expect(today.total).toBe(3);
    expect(today.byModel["gpt-4o-mini"]).toBe(2);
    expect(today.byModel["claude-opus-4-8"]).toBe(1);
    expect(days[days.length - 2].total).toBe(1); // yesterday
  });

  it("filters by billing path", () => {
    const data = [
      conv("a", [
        msg("b", now, { model: "gpt-4o-mini", inputTokens: 1, outputTokens: 1, billed: "byo" }),
        msg("s", now, { model: "gpt-4o-mini", inputTokens: 1, outputTokens: 1, billed: "subscription" }),
      ]),
    ];
    expect(dailyModelMessages(data, 14, "byo").days.at(-1)!.total).toBe(1);
    expect(dailyModelMessages(data, 14, "subscription").days.at(-1)!.total).toBe(1);
    expect(dailyModelMessages(data, 14, "all").days.at(-1)!.total).toBe(2);
  });

  it("falls back to conversation updatedAt when a turn has no timestamp", () => {
    const legacy: Message = { id: "l", role: "assistant", content: "x", usage: { model: "gpt-4o-mini", inputTokens: 1, outputTokens: 1 } };
    const { days } = dailyModelMessages([conv("a", [legacy], now)], 14);
    expect(days.at(-1)!.total).toBe(1);
  });

  it("ignores turns without usage", () => {
    const { days, models } = dailyModelMessages(
      [conv("a", [{ id: "u", role: "user", content: "hi", at: now }])],
      14,
    );
    expect(models).toEqual([]);
    expect(days.every((d) => d.total === 0)).toBe(true);
  });
});
