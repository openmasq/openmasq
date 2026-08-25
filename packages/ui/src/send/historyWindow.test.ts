import { describe, it, expect } from "vitest";
import { fitHistoryToContext, estimateMessageTokens } from "./historyWindow";
import type { ChatMessage } from "@openmasq/llm";

const sys = (c: string): ChatMessage => ({ role: "system", content: c });
const user = (c: string): ChatMessage => ({ role: "user", content: c });
const asst = (c: string): ChatMessage => ({ role: "assistant", content: c });
/** ~n tokens of filler (chars/4). */
const filler = (tokens: number) => "x".repeat(tokens * 4);

describe("fitHistoryToContext", () => {
  it("does NOT trim when the window is unknown (undefined) — never worse than before", () => {
    const h = [sys("s"), user(filler(1000)), asst(filler(1000)), user("hi")];
    expect(fitHistoryToContext(h, { contextTokens: undefined }).dropped).toBe(0);
  });

  it("does NOT trim a short conversation that fits", () => {
    const h = [sys("s"), user("a"), asst("b"), user("c")];
    const r = fitHistoryToContext(h, { contextTokens: 8000 });
    expect(r.dropped).toBe(0);
    expect(r.messages).toEqual(h);
  });

  it("drops the OLDEST turns, keeps system + the most-recent that fit", () => {
    const h = [
      sys("SYS"),
      user(filler(500)), // oldest — should be dropped
      asst(filler(500)),
      user(filler(500)),
      asst(filler(500)),
      user("dernière question"), // newest — always kept
    ];
    const r = fitHistoryToContext(h, { contextTokens: 2000, reserveTokens: 200 });
    expect(r.dropped).toBeGreaterThan(0);
    expect(r.messages[0].role).toBe("system");
    expect(r.messages[0].content).toContain("les plus ANCIENS"); // omission marker folded in
    // the current (last) user turn is always present
    expect(r.messages[r.messages.length - 1].content).toBe("dernière question");
    // the window never starts on an assistant turn (Anthropic-safe)
    expect(r.messages[1].role).toBe("user");
  });

  it("ALWAYS keeps the final user turn even if it alone exceeds the budget", () => {
    const h = [sys("s"), user(filler(1000)), asst(filler(1000)), user(filler(5000))];
    const r = fitHistoryToContext(h, { contextTokens: 1000, reserveTokens: 0 });
    expect(r.messages[r.messages.length - 1]).toBe(h[3]);
    expect(r.dropped).toBeGreaterThan(0);
  });

  it("estimateMessageTokens counts content + image attachments", () => {
    expect(estimateMessageTokens(user("x".repeat(40)))).toBe(10 + 4); // 40/4 + overhead
    const withImg = { role: "user", content: "", attachments: [{ name: "a.png" }] } as unknown as ChatMessage;
    expect(estimateMessageTokens(withImg)).toBeGreaterThan(800);
  });
});
