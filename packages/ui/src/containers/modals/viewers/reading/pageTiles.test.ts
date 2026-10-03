import { describe, expect, it } from "vitest";
import { MAX_READING_TILES, readingPages } from "./pageTiles";

describe("readingPages — the state of each page of a PDF being read", () => {
  const r = { total: 4, thumbs: ["data:image/png;base64,A", undefined, "data:image/png;base64,C"], read: [true, true] };

  it("read pages ✓, the first unread is being read, the rest wait", () => {
    expect(readingPages(r, true).pages.map((p) => p.state)).toEqual(["read", "read", "current", "waiting"]);
    expect(readingPages(r, true).pages[1].src).toBeUndefined();
  });

  it("while still queued, no page is « en cours »", () => {
    expect(readingPages({ ...r, read: [] }, false).pages.every((p) => p.state === "waiting")).toBe(true);
  });

  it("a long document is capped, the remainder counted", () => {
    const long = readingPages({ total: 400, thumbs: [], read: [] }, true);
    expect(long.pages).toHaveLength(MAX_READING_TILES);
    expect(long.more).toBe(400 - MAX_READING_TILES);
  });
});
