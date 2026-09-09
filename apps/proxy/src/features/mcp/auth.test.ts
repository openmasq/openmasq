import { describe, expect, it } from "vitest";
import { openInBrowser } from "./auth";
import { parseMcpArgs } from "./cli";

describe("opening the consent page", () => {
  it("refuses a scheme that is not http(s) — a hostile server must not hand the OS a file://", () => {
    expect(openInBrowser(new URL("file:///etc/passwd"))).toBe(false);
    expect(openInBrowser(new URL("myapp://steal"))).toBe(false);
    expect(openInBrowser(new URL("javascript:alert(1)"))).toBe(false);
  });
});

describe("the mcp command line", () => {
  it("defaults to status", () => {
    expect(parseMcpArgs([])).toMatchObject({ command: "status", adopt: true });
  });

  it("reads a target and the two dials", () => {
    expect(parseMcpArgs(["login", "notion", "--config", "/tmp/m.json", "--no-adopt"])).toEqual({
      command: "login",
      target: "notion",
      configPath: "/tmp/m.json",
      adopt: false,
    });
  });

  it("refuses a flag it does not know rather than ignoring it", () => {
    expect(() => parseMcpArgs(["login", "--wat"])).toThrow(/Unknown flag/);
  });
});
