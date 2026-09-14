// The body half of `safeFetch`: what each `accept` admits, and that a sink receives every
// byte without the buffer growing — the cap holding on both paths.
import { describe, expect, it } from "vitest";
import { contentTypeOk, readCapped } from "./body";

const response = (chunks: Uint8Array[], contentLength?: number): Response =>
  new Response(
    new ReadableStream({
      start(c) {
        for (const ch of chunks) c.enqueue(ch);
        c.close();
      },
    }),
    { headers: contentLength === undefined ? {} : { "content-length": String(contentLength) } },
  );

describe("contentTypeOk", () => {
  it("binary admits octet-stream, gzip and a Windows executable's labels, nothing textual", () => {
    expect(contentTypeOk("application/octet-stream", "binary")).toBe(true);
    expect(contentTypeOk("application/gzip; charset=binary", "binary")).toBe(true);
    // downloads.claude.ai labels `win32-x64/claude.exe` this way (measured 14/09/2026).
    expect(contentTypeOk("application/x-msdos-program", "binary")).toBe(true);
    expect(contentTypeOk("application/vnd.microsoft.portable-executable", "binary")).toBe(true);
    expect(contentTypeOk("text/html", "binary")).toBe(false);
    expect(contentTypeOk("application/javascript", "binary")).toBe(false);
    expect(contentTypeOk("application/octet-stream", "text")).toBe(false);
  });
});

describe("readCapped", () => {
  it("hands every chunk to the sink and keeps nothing", async () => {
    const seen: number[] = [];
    const buf = await readCapped(response([new Uint8Array([1, 2]), new Uint8Array([3])]), 10, (c) => seen.push(...c));
    expect(seen).toEqual([1, 2, 3]);
    expect(buf.byteLength).toBe(0);
  });
  it("enforces the cap on the sink path — a declared length over it, and a body that crosses it", async () => {
    await expect(readCapped(response([new Uint8Array(4)], 100), 10, () => {})).rejects.toThrow(/too large/);
    await expect(readCapped(response([new Uint8Array(8), new Uint8Array(8)]), 10, () => {})).rejects.toThrow(/too large/);
  });
});
