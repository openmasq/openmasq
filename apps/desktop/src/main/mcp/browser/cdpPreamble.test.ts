import { describe, it, expect } from "vitest";
import { cdpPreamble, parseCdpPreamble, readCdpPreamble } from "./cdpPreamble";

const ENDPOINT = `http://127.0.0.1:51234/${"ab".repeat(18)}`;
const reader = (text: string) => {
  const bytes = Buffer.from(text);
  let i = 0;
  return (b: Buffer) => (i < bytes.length ? ((b[0] = bytes[i++]!), 1) : 0);
};

describe("CDP endpoint preamble — the broker secret never rides in an exec environment", () => {
  it("round-trips the endpoint and consumes NOTHING past the first line", () => {
    const init = '{"jsonrpc":"2.0","id":0,"method":"initialize"}\n';
    const read = reader(`${JSON.stringify(cdpPreamble(ENDPOINT))}\n${init}`);
    expect(readCdpPreamble(read)).toBe(ENDPOINT);
    // the next byte the MCP server reads is the start of `initialize`
    const next = Buffer.alloc(1);
    read(next);
    expect(next.toString()).toBe("{");
  });

  it("refuses a non-loopback endpoint, another method, garbage and EOF", () => {
    expect(parseCdpPreamble(JSON.stringify(cdpPreamble("http://evil.example:9222/x")))).toBeUndefined();
    expect(parseCdpPreamble('{"jsonrpc":"2.0","method":"initialize","params":{"endpoint":"http://127.0.0.1:1/x"}}')).toBeUndefined();
    expect(parseCdpPreamble("not json")).toBeUndefined();
    expect(readCdpPreamble(reader(""))).toBeUndefined();
  });
});
