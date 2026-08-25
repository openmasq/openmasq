import { describe, it, expect } from "vitest";
import type { ChatMessage } from "@openmasq/llm";
import {
  COMPACT_MIN_TURNS,
  COMPACT_STRIDE,
  SUMMARY_MAX_CHARS,
  compactableTurns,
  compactionPrompt,
  nextCompactionTarget,
  parseSummary,
  summaryCovers,
  summaryMarker,
  type ContextSummary,
} from "./contextSummary";
import { fitHistoryToContext } from "./historyWindow";

const summary = (over: Partial<ContextSummary> = {}): ContextSummary => ({
  throughTurn: 20,
  text: "- Objectif : migrer le CRM\n- Contrainte : pas de coupure",
  at: 0,
  ...over,
});

describe("summaryCovers — a partial recap is worse than an honest marker", () => {
  it("accepts a summary that covers every dropped turn", () => {
    expect(summaryCovers(summary(), 20)).toBe(true);
    expect(summaryCovers(summary(), 12)).toBe(true);
  });

  it("REFUSES one that stops short — the uncovered head would vanish inside a confident recap", () => {
    expect(summaryCovers(summary({ throughTurn: 8 }), 20)).toBe(false);
  });

  it("refuses an absent or empty summary", () => {
    expect(summaryCovers(undefined, 5)).toBe(false);
    expect(summaryCovers(summary({ text: "   " }), 5)).toBe(false);
  });
});

describe("nextCompactionTarget", () => {
  it("does not run on a short conversation", () => {
    expect(nextCompactionTarget(COMPACT_MIN_TURNS - 1, undefined)).toBeNull();
  });

  it("runs on a long one, and never summarises the most recent turns", () => {
    const target = nextCompactionTarget(40, undefined)!;
    expect(target).toBeGreaterThan(0);
    expect(target).toBeLessThan(40);
  });

  it("does not re-run for a handful of new turns", () => {
    const first = nextCompactionTarget(40, undefined)!;
    expect(nextCompactionTarget(42, summary({ throughTurn: first }))).toBeNull();
  });

  it("runs again once a full stride has accumulated", () => {
    const first = nextCompactionTarget(40, undefined)!;
    const later = nextCompactionTarget(40 + COMPACT_STRIDE * 2, summary({ throughTurn: first }));
    expect(later).not.toBeNull();
    expect(later!).toBeGreaterThan(first);
  });
});

describe("parseSummary", () => {
  it("strips a fenced block and trims", () => {
    expect(parseSummary("```\n- un fait suffisamment long pour compter\n```")).toBe(
      "- un fait suffisamment long pour compter",
    );
  });

  it("returns null on an empty or near-empty reply — never an empty summary", () => {
    // An empty summary would read as "nothing happened in the first thirty messages".
    expect(parseSummary("")).toBeNull();
    expect(parseSummary("ok")).toBeNull();
    expect(parseSummary(undefined)).toBeNull();
  });

  it("caps the stored text", () => {
    expect(parseSummary("x".repeat(SUMMARY_MAX_CHARS * 2))!.length).toBe(SUMMARY_MAX_CHARS);
  });
});

describe("compactionPrompt", () => {
  it("carries the wire text and asks for facts and decisions, not prose", () => {
    const p = compactionPrompt("Utilisateur : bonjour");
    expect(p).toContain("Utilisateur : bonjour");
    expect(p).toMatch(/décisions/i);
    expect(p).toMatch(/N'invente rien/);
  });

  it("hands the previous memo back so the next pass EXTENDS instead of restarting", () => {
    expect(compactionPrompt("wire", "mémo antérieur")).toContain("mémo antérieur");
  });
});

describe("summaryMarker", () => {
  it("says the head is gone, gives the recap, and warns it IS a recap", () => {
    const m = summaryMarker(summary(), 20);
    expect(m).toContain("20 message(s)");
    expect(m).toContain("migrer le CRM");
    expect(m).toMatch(/RÉSUMÉ/);
    expect(m).toMatch(/demande-le plutôt que de le supposer/);
  });
});

describe("compactableTurns", () => {
  it("keeps user and assistant turns with content, drops the rest", () => {
    const messages = [
      { role: "system", content: "sys" },
      { role: "user", content: "a" },
      { role: "assistant", content: "" },
      { role: "tool", content: "t", toolCallId: "1" },
      { role: "assistant", content: "b" },
    ] as ChatMessage[];
    expect(compactableTurns(messages)).toEqual([
      { role: "user", text: "a" },
      { role: "assistant", text: "b" },
    ]);
  });
});

describe("fitHistoryToContext + summary", () => {
  const long = (): ChatMessage[] => {
    const out: ChatMessage[] = [{ role: "system", content: "sys" }];
    for (let i = 0; i < 40; i++) {
      out.push({ role: i % 2 === 0 ? "user" : "assistant", content: "x".repeat(400) });
    }
    return out;
  };

  it("injects the recap instead of the bare marker when it covers the drop", () => {
    const { messages, dropped } = fitHistoryToContext(long(), {
      contextTokens: 2000,
      summary: summary({ throughTurn: 40 }),
    });
    expect(dropped).toBeGreaterThan(0);
    expect(messages[0]!.content).toContain("migrer le CRM");
  });

  it("falls back to the honest marker when the recap stops short", () => {
    const { messages, dropped } = fitHistoryToContext(long(), {
      contextTokens: 2000,
      summary: summary({ throughTurn: 1 }),
    });
    expect(dropped).toBeGreaterThan(1);
    expect(messages[0]!.content).not.toContain("migrer le CRM");
    expect(messages[0]!.content).toContain("omis pour tenir dans la fenêtre");
  });

  it("changes nothing when nothing was dropped", () => {
    const input = long();
    const { messages, dropped } = fitHistoryToContext(input, {
      contextTokens: 10_000_000,
      summary: summary({ throughTurn: 40 }),
    });
    expect(dropped).toBe(0);
    expect(messages).toBe(input);
  });
});
