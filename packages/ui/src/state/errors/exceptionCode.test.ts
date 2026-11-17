import { describe, expect, it } from "vitest";
import { turnExceptionCode } from "./exceptionCode";
import { sendErrorReason } from "./humanize";

describe("turnExceptionCode — the exception says what send_error says", () => {
  it("an OpenAI account out of credits (a 429 in disguise) raises NO exception", () => {
    const openai = "429 You exceeded your current quota, please check your plan and billing details. insufficient_quota";
    expect(sendErrorReason(openai)).toBe("provider_credits");
    expect(turnExceptionCode(sendErrorReason(openai))).toBeNull();
  });

  it("the user's account states are counted in send_error, never as exceptions", () => {
    for (const r of ["provider_credits", "missing_key", "auth"] as const) expect(turnExceptionCode(r)).toBeNull();
  });

  it("a real rate limit and the named CLI failures keep their readable code", () => {
    expect(turnExceptionCode(sendErrorReason("429 Too Many Requests: rate limit reached"))).toBe("rate-limit");
    expect(turnExceptionCode("cli_prompt_too_long")).toBe("cli-prompt-too-long");
    expect(turnExceptionCode("server")).toBe("server");
  });

  it("an unclassified failure keeps the historic `tool-loop`", () => {
    expect(turnExceptionCode("unknown")).toBe("tool-loop");
  });
});
