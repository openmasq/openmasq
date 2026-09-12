import { describe, expect, it } from "vitest";
import { parseConfigFile, readConfigFile } from "./file";

describe("~/.openmasq/proxy.json", () => {
  it("reads run, clients (by lower-cased tool) and leaves mcp to its own validator", () => {
    const f = parseConfigFile(
      JSON.stringify({
        $schema: "x",
        run: { level: "renforce", console: true, disable: ["username"], always: ["Acme:company"] },
        clients: { Hermes: { open: true } },
        mcp: { notion: { source: "openmasq" } },
      }),
      "p.json",
    );
    expect(f.run).toEqual({
      level: "renforce",
      console: true,
      disable: ["username"],
      always: [{ value: "Acme", category: "company" }],
    });
    expect(f.clients).toEqual({ hermes: { open: true } });
    expect(f.mcp).toEqual({ notion: { source: "openmasq" } });
  });

  it("refuses rather than ignores: bad JSON, a stranger section, an unknown or misspelt option, a per-run flag", () => {
    expect(() => parseConfigFile("{", "p.json")).toThrow(/p.json: not valid JSON/);
    expect(() => parseConfigFile("[]", "p.json")).toThrow(/must be a JSON object/);
    expect(() => parseConfigFile('{"runs":{}}', "p.json")).toThrow(
      /unknown section "runs" — did you mean "run"/,
    );
    expect(() => parseConfigFile('{"run":{"levl":"strict"}}', "p.json")).toThrow(
      /p.json › run: unknown option "levl" — did you mean "level"/,
    );
    expect(() => parseConfigFile('{"run":{"level":"strcit"}}', "p.json")).toThrow(
      /standard, renforce or strict/,
    );
    // Real values on a screen are asked for per run, never remembered by a file.
    expect(() => parseConfigFile('{"run":{"reveal":true}}', "p.json")).toThrow(
      /per-run flag \(--reveal\)/,
    );
    expect(() => parseConfigFile('{"clients":{"claude":[]}}', "p.json")).toThrow(
      /clients.claude must be an object/,
    );
    expect(() => parseConfigFile('{"mcp":[]}', "p.json")).toThrow(/mcp must be an object/);
  });

  it("treats an absent default file as no file, and an absent NAMED file as an error", () => {
    expect(readConfigFile("", () => undefined)).toBeUndefined();
    expect(() => readConfigFile("/etc/openmasq/proxy.json", () => undefined)).toThrow(
      /no such file/,
    );
    expect(readConfigFile("/x/p.json", () => '{"run":{"port":9000}}')?.run).toEqual({ port: 9000 });
  });
});
