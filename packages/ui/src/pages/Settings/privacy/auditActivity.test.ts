import { describe, it, expect } from "vitest";
import { dailyRedactionsByCategory } from "./auditActivity";

const now = Date.now();
const DAY = 86_400_000;

describe("dailyRedactionsByCategory", () => {
  it("buckets redactions by day and orders categories by total desc", () => {
    const { days, cats } = dailyRedactionsByCategory(
      [
        { at: now, kind: "email" },
        { at: now, kind: "name" },
        { at: now, kind: "name" },
        { at: now - DAY, kind: "name" },
      ],
      14,
    );
    // name (3) before email (1)
    expect(cats).toEqual(["name", "email"]);
    const today = days[days.length - 1];
    expect(today.total).toBe(3);
    expect(today.byCat.name).toBe(2);
    expect(today.byCat.email).toBe(1);
    expect(days[days.length - 2].total).toBe(1); // yesterday
  });

  it("drops entries older than the window and without a timestamp", () => {
    const { days, cats } = dailyRedactionsByCategory(
      [
        { at: now - 30 * DAY, kind: "name" },
        { at: 0, kind: "email" },
      ],
      14,
    );
    expect(cats).toEqual([]);
    expect(days.every((d) => d.total === 0)).toBe(true);
  });
});
