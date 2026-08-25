import { describe, it, expect } from "vitest";
import type { Conversation } from "../types";
import { groupConversationsByDate } from "./conversationGroups";

const DAY = 86_400_000;
// A fixed "now" mid-day so day-boundary math is deterministic across time zones.
const NOW = new Date(2026, 6, 12, 15, 0, 0).getTime(); // 12 Jul 2026, 15:00 local

/** Minimal conversation carrying only the fields the grouping reads. */
function conv(id: string, updatedAt: number): Conversation {
  return { id, title: id, modelId: "m", messages: [], createdAt: updatedAt, updatedAt };
}

describe("groupConversationsByDate", () => {
  it("buckets into today / yesterday / 7d / 30d / month", () => {
    const convs = [
      conv("today", NOW - 60_000), // an hour ago
      conv("earlier-today", NOW - 6 * 3_600_000),
      conv("yesterday", NOW - 1 * DAY),
      conv("threeDays", NOW - 3 * DAY),
      conv("tenDays", NOW - 10 * DAY),
      conv("old", NOW - 120 * DAY), // ~4 months back
    ];
    const groups = groupConversationsByDate(convs, NOW);
    const byLabel = Object.fromEntries(
      groups.map((g) => [g.label, g.items.map((c) => c.id)]),
    );
    expect(byLabel["Aujourd'hui"]).toEqual(["today", "earlier-today"]);
    expect(byLabel["Hier"]).toEqual(["yesterday"]);
    expect(byLabel["7 derniers jours"]).toEqual(["threeDays"]);
    expect(byLabel["30 derniers jours"]).toEqual(["tenDays"]);
    // The oldest falls into a capitalised "Month Year" bucket.
    const monthGroup = groups.find((g) => g.items.some((c) => c.id === "old"));
    expect(monthGroup?.label).toMatch(/^\p{Lu}.+\d{4}$/u);
  });

  it("preserves input order and returns groups most-recent first", () => {
    const groups = groupConversationsByDate(
      [conv("a", NOW - 10 * DAY), conv("b", NOW - 60_000), conv("c", NOW - 1 * DAY)],
      NOW,
    );
    expect(groups.map((g) => g.key)).toEqual(["30d", "today", "yesterday"]);
  });

  it("omits empty groups and handles an empty input", () => {
    expect(groupConversationsByDate([], NOW)).toEqual([]);
    const groups = groupConversationsByDate([conv("t", NOW - 60_000)], NOW);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("Aujourd'hui");
  });

  it("treats the 7-day boundary as inclusive, 8 days as 30-day bucket", () => {
    const groups = groupConversationsByDate(
      [conv("seven", NOW - 7 * DAY), conv("eight", NOW - 8 * DAY)],
      NOW,
    );
    expect(groups.find((g) => g.key === "7d")?.items.map((c) => c.id)).toEqual(["seven"]);
    expect(groups.find((g) => g.key === "30d")?.items.map((c) => c.id)).toEqual(["eight"]);
  });
});
