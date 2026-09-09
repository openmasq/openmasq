import { describe, expect, it } from "vitest";
import type { Request } from "express";
import { familyOf } from "./routes";

const req = (path: string, headers: Record<string, string> = {}): Request =>
  ({ originalUrl: path, path, headers }) as unknown as Request;

describe("familyOf — a text-less request is relayed to the family it belongs to", () => {
  it("reads the prefix, then the path shapes", () => {
    expect(familyOf(req("/anthropic/v1/models"))).toBe("anthropic");
    expect(familyOf(req("/v1/messages/count_tokens"))).toBe("anthropic");
    expect(familyOf(req("/v1beta/models/gemini-2.5-pro:countTokens"))).toBe("gemini");
    expect(familyOf(req("/v1/models"))).toBe("openai");
  });

  /** Claude Code probes `HEAD /api/hello` on its base URL before the first call: nothing in
   *  the path says which vendor, but its headers do. Filed under openai, the audit line was
   *  naming an upstream the request never went to. */
  it("reads the client's headers when the path names nobody", () => {
    expect(familyOf(req("/api/hello", { "anthropic-version": "2023-06-01" }))).toBe("anthropic");
    expect(familyOf(req("/api/hello", { "x-api-key": "sk-ant-…" }))).toBe("anthropic");
    expect(familyOf(req("/api/hello", { "x-goog-api-key": "AIza…" }))).toBe("gemini");
    expect(familyOf(req("/api/hello", { authorization: "Bearer sk-…" }))).toBe("openai");
  });
});
