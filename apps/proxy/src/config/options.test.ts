import { describe, expect, it } from "vitest";
import { byFlag, closest, fromJson, fromString, OPTIONS, parseAlways } from "./options";
import { USAGE } from "./usage";

describe("the options table", () => {
  it("is the one home: every flag is in --help, and every flag --help names is in the table", () => {
    const documented = new Set(USAGE.match(/--[a-z][a-z-]*/g));
    for (const o of OPTIONS) if (o.flag) expect(documented, o.flag).toContain(o.flag);
    // `--config` and `--help` are the parser's own, not options; `--` is the separator; `--url`
    // belongs to the `console` subcommand, whose usage line shares the text.
    const own = new Set(["--config", "--help", "--", "--url"]);
    for (const flag of documented)
      if (!own.has(flag))
        expect(byFlag(flag), `${flag} is in --help but not in the table`).toBeDefined();
  });

  it("names are unique across name, flag and env, and every file key is a plain word", () => {
    const names = OPTIONS.map((o) => o.name);
    expect(new Set(names).size).toBe(names.length);
    const envs = OPTIONS.map((o) => o.env).filter(Boolean);
    expect(new Set(envs).size).toBe(envs.length);
    for (const n of names) expect(n).toMatch(/^[a-z][A-Za-z]*$/);
  });

  it("types a string source strictly — a value that is none of the choices is an error, not a default", () => {
    const level = OPTIONS.find((o) => o.name === "level")!;
    expect(fromString(level, "strict", "flag")).toBe("strict");
    expect(() => fromString(level, "strcit", "flag")).toThrow(
      /--level is standard, renforce or strict, not strcit/,
    );
    expect(() => fromString(level, "strcit", "env")).toThrow(/OPENMASQ_PROXY_LEVEL is/);
    const splash = OPTIONS.find((o) => o.name === "splash")!;
    expect(fromString(splash, "0", "env")).toBe(false);
    expect(fromString(splash, "yes", "env")).toBe(true);
    expect(() => fromString(splash, "maybe", "env")).toThrow(/true or false/);
    const keep = OPTIONS.find((o) => o.name === "keep")!;
    expect(fromString(keep, "Stripe, Canva", "flag")).toEqual(["Stripe", "Canva"]);
  });

  it("types a JSON value by the option's kind, and reads always-terms in both spellings", () => {
    const always = OPTIONS.find((o) => o.name === "always")!;
    expect(
      fromJson(
        always,
        ["Groupe Delorme:company", { value: "FR76 3000", category: "iban" }, "Rebour"],
        "run",
      ),
    ).toEqual([
      { value: "Groupe Delorme", category: "company" },
      { value: "FR76 3000", category: "iban" },
      { value: "Rebour", category: "name" },
    ]);
    expect(() => fromJson(always, [{ category: "name" }], "run")).toThrow(/value:type/);
    const port = OPTIONS.find((o) => o.name === "port")!;
    expect(() => fromJson(port, "8787", "run")).toThrow(/run.port must be a number/);
    const mode = OPTIONS.find((o) => o.name === "mode")!;
    expect(() => fromJson(mode, "loud", "run")).toThrow(/fake or token/);
    expect(parseAlways("A:company, B")).toEqual([
      { value: "A", category: "company" },
      { value: "B", category: "name" },
    ]);
  });

  it("suggests the nearest option name for a typo, and nothing for a stranger", () => {
    expect(closest("levl")).toBe("level");
    expect(closest("mcpwrites")).toBe("mcpWrites");
    expect(closest("banana")).toBeUndefined();
  });
});
