import { describe, expect, it } from "vitest";
import { parseArgs } from "./config";

describe("config", () => {
  it("reads flags over env over defaults, and validates", () => {
    const c = parseArgs(
      ["--port", "9000", "--mode", "token", "--keep", "Stripe, Canva", "--rules-only"],
      { OPENMASQ_UPSTREAM_OPENAI: "http://localhost:1" },
    );
    expect(c).toMatchObject({
      port: 9000,
      mode: "token",
      keep: ["Stripe", "Canva"],
      rulesOnly: true,
      openai: "http://localhost:1",
      host: "127.0.0.1",
    });
    expect(() => parseArgs(["--port", "0"])).toThrow(/port/);
    expect(() => parseArgs(["--mode", "loud"])).toThrow(/fake or token/);
    expect(() => parseArgs(["--openai", "ftp://x"])).toThrow(/origin/);
    expect(parseArgs(["--gemini", "http://localhost:2"]).gemini).toBe("http://localhost:2");
    expect(() => parseArgs(["--nope"])).toThrow(/Unknown flag/);
  });

  it("takes a tool to wrap after --, and a log file for its request lines", () => {
    const c = parseArgs(["--level", "strict", "--log", "/tmp/p.log", "--", "claude", "--resume"]);
    expect(c).toMatchObject({
      level: "strict",
      logFile: "/tmp/p.log",
      command: ["claude", "--resume"],
    });
    expect(parseArgs([]).command).toEqual([]);
    expect(() => parseArgs(["--"])).toThrow(/needs a command/);
  });

  it("refuses --reveal wherever a real value would be kept or machine-read", () => {
    expect(parseArgs(["--reveal"]).reveal).toBe(true);
    expect(() => parseArgs(["--reveal", "--json"])).toThrow(/machine log/);
    expect(() => parseArgs(["--reveal", "--", "claude"])).toThrow(/owns the terminal/);
  });

  it("binds loopback only — the host is not a flag", () => {
    expect(parseArgs([]).host).toBe("127.0.0.1");
    expect(parseArgs([]).level).toBe("standard"); // deterministic rules by default
    expect(() => parseArgs(["--host", "0.0.0.0"])).toThrow(/Unknown flag/);
  });
});
