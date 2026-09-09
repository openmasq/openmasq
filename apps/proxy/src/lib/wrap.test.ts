import { describe, expect, it } from "vitest";
import { wrappedEnv } from "./wrap";

describe("the wrapped child", () => {
  it("gets the three base URLs pointed at the proxy", () => {
    const env = wrappedEnv("http://127.0.0.1:8787", {});
    expect(env.OPENAI_BASE_URL).toBe("http://127.0.0.1:8787/v1");
    expect(env.ANTHROPIC_BASE_URL).toBe("http://127.0.0.1:8787");
  });
});
