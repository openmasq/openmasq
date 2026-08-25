import { beforeEach, describe, expect, it } from "vitest";
import {
  isFetchHostAllowed,
  noteFetchHost,
  noteFetchHostsFromText,
  _resetFetchAllow,
} from "./fetchAllow";

/**
 * SECURITY (audit M4): the fetch-host allow-list is FAIL-CLOSED and seeded ONLY from content
 * main RECEIVED (streamed reply / MCP tool results) — NOT from outgoing renderer message text,
 * which a renderer XSS controls. These pin the store's contract; the seeding sites live in
 * `index.ts` (received reply) + `mcp/server/callTool.ts` (tool results), never on the
 * outgoing-message path.
 */
describe("fetchAllow (M4 exfiltration boundary)", () => {
  beforeEach(() => _resetFetchAllow());

  it("refuses an un-observed host (fail closed by default)", () => {
    expect(isFetchHostAllowed("https://attacker.com/?d=secret")).toBe(false);
  });

  it("allows a host only after it is observed in relayed content", () => {
    noteFetchHostsFromText("see the report at https://example.com/article for details");
    expect(isFetchHostAllowed("https://example.com/other?q=1")).toBe(true); // host, not path/query
    expect(isFetchHostAllowed("https://attacker.com/?d=secret")).toBe(false);
  });

  it("noteFetchHost records a single structural URL's host", () => {
    noteFetchHost("https://cdn.example.org/export.csv");
    expect(isFetchHostAllowed("https://cdn.example.org/export.csv")).toBe(true);
  });

  it("refuses a malformed URL", () => {
    noteFetchHostsFromText("https://example.com");
    expect(isFetchHostAllowed("not a url")).toBe(false);
  });

  it("_resetFetchAllow clears every observed host", () => {
    noteFetchHostsFromText("https://example.com");
    _resetFetchAllow();
    expect(isFetchHostAllowed("https://example.com")).toBe(false);
  });
});
