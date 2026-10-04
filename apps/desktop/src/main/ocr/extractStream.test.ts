// What main relays of a PDF being read (`extractStream.ts`): an ALLOW-listed, bounded shape,
// and thumbnails that are unreadable whatever produced them — a PNG over the pinned pixel
// bound, or anything not a PNG, never reaches the renderer.
import { describe, expect, it } from "vitest";
import { STREAM_PAGE_MAX_CHARS, THUMB_MAX_HEIGHT_PX, THUMB_MAX_WIDTH_PX } from "@openmasq/redact/documents";
import { checkStreamMessage } from "./extractStream";

function png(width: number, height: number): string {
  const out = new Uint8Array(33);
  out.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const dv = new DataView(out.buffer);
  dv.setUint32(16, width);
  dv.setUint32(20, height);
  return Buffer.from(out).toString("base64");
}

describe("checkStreamMessage — pages", () => {
  it("rebuilds a well-formed page, dropping any extra field", () => {
    expect(checkStreamMessage({ id: 1, page: { n: 2, total: 3, read: true, text: "p2", extra: "x" } })).toEqual({
      page: { n: 2, total: 3, read: true, text: "p2" },
    });
    expect(checkStreamMessage({ page: { n: 1, total: 1, read: false } })).toEqual({ page: { n: 1, total: 1, read: false } });
  });

  it.each([
    { n: 0, total: 3, read: true },
    { n: 4, total: 3, read: true },
    { n: 1.5, total: 3, read: true },
    { n: 1, total: 1e9, read: true },
    { n: 1, total: 3, read: "yes" },
    { n: 1, total: 3, read: true, text: 42 },
    { n: 1, total: 3, read: true, text: "x".repeat(STREAM_PAGE_MAX_CHARS + 1) },
  ])("refuses a malformed or unbounded page %#", (page) => {
    expect(checkStreamMessage({ page })).toBeNull();
  });
});

describe("checkStreamMessage — thumbnails", () => {
  it("relays a PNG within the bound as a data URL", () => {
    const ev = checkStreamMessage({ thumb: { n: 1, total: 2, png: png(THUMB_MAX_WIDTH_PX, THUMB_MAX_HEIGHT_PX) } });
    expect(ev?.thumb?.src.startsWith("data:image/png;base64,")).toBe(true);
  });

  it("refuses a raster wider or taller than the pinned bound — a legible page never passes", () => {
    expect(checkStreamMessage({ thumb: { n: 1, total: 2, png: png(THUMB_MAX_WIDTH_PX + 1, 50) } })).toBeNull();
    expect(checkStreamMessage({ thumb: { n: 1, total: 2, png: png(30, THUMB_MAX_HEIGHT_PX + 1) } })).toBeNull();
    expect(checkStreamMessage({ thumb: { n: 1, total: 2, png: png(1240, 1754) } })).toBeNull();
  });

  it("refuses what is not a PNG, an oversized payload, an unknown message", () => {
    expect(checkStreamMessage({ thumb: { n: 1, total: 2, png: Buffer.from("<svg/>").toString("base64") } })).toBeNull();
    expect(checkStreamMessage({ thumb: { n: 1, total: 2, png: "A".repeat(100_000) } })).toBeNull();
    expect(checkStreamMessage({ thumb: { n: 1, total: 2 } })).toBeNull();
    expect(checkStreamMessage({ other: 1 })).toBeNull();
    expect(checkStreamMessage(null)).toBeNull();
  });
});
