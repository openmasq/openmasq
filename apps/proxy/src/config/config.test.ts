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

  it("takes the terminal's ground from the flag, the env, or leaves it to auto", () => {
    expect(parseArgs([]).theme).toBe("auto");
    expect(parseArgs(["--theme", "light"]).theme).toBe("light");
    expect(parseArgs([], { OPENMASQ_PROXY_THEME: "dark" }).theme).toBe("dark");
    expect(parseArgs(["--theme", "dark"], { OPENMASQ_PROXY_THEME: "light" }).theme).toBe("dark");
    expect(() => parseArgs(["--theme", "sepia"])).toThrow(/auto, light or dark/);
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
    // …unless the console page is there to show them: that page is the operator's screen
    // for a wrapped run, and the log file stays counts-only (`reporter.test.ts`, `revealFor`).
    const c = parseArgs(["--reveal", "--console", "--", "claude"]);
    expect(c.reveal && c.console && c.command).toEqual(["claude"]);
  });

  it("binds loopback only — the host is not a flag", () => {
    expect(parseArgs([]).host).toBe("127.0.0.1");
    expect(parseArgs([]).level).toBe("standard"); // deterministic rules by default
    expect(() => parseArgs(["--host", "0.0.0.0"])).toThrow(/Unknown flag/);
  });
});
