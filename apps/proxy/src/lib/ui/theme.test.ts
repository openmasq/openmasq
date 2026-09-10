import { describe, expect, it } from "vitest";
import { colorDepth, resolveTheme } from "./theme";

describe("terminal theme", () => {
  it("takes the flag first, then the env, then what the terminal published", () => {
    expect(resolveTheme("light", { COLORFGBG: "15;0" })).toBe("light");
    expect(resolveTheme("auto", { OPENMASQ_PROXY_THEME: "light" })).toBe("light");
    expect(resolveTheme("auto", { COLORFGBG: "0;15" })).toBe("light");
    expect(resolveTheme("auto", { COLORFGBG: "15;0" })).toBe("dark");
    expect(resolveTheme("auto", { COLORFGBG: "15;default;0" })).toBe("dark");
  });

  it("falls back to dark on anything it cannot read", () => {
    expect(resolveTheme("auto", {})).toBe("dark");
    expect(resolveTheme("auto", { COLORFGBG: "15;default" })).toBe("dark");
    expect(resolveTheme("auto", { OPENMASQ_PROXY_THEME: "sepia" })).toBe("dark");
  });

  /** 256 is the safe answer: every colour terminal has the cube, and `xterm-256color` alone
   *  is exactly what a terminal WITHOUT truecolor reports. */
  it("only claims truecolor when the terminal says so", () => {
    expect(colorDepth({ COLORTERM: "truecolor" })).toBe(24);
    expect(colorDepth({ COLORTERM: "24bit" })).toBe(24);
    expect(colorDepth({ TERM: "xterm-direct" })).toBe(24);
    expect(colorDepth({ FORCE_COLOR: "3" })).toBe(24);
    expect(colorDepth({ TERM: "xterm-256color" })).toBe(8);
    expect(colorDepth({ FORCE_COLOR: "1" })).toBe(8);
    expect(colorDepth({})).toBe(8);
  });
});
