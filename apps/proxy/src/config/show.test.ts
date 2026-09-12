import { describe, expect, it } from "vitest";
import { jsonSchema, runConfigCommand } from "./show";

const FILE = JSON.stringify({
  run: { level: "renforce", console: true, always: ["Acme:company", "Rebour"] },
  clients: { hermes: { open: true } },
});

const harness = (file?: string, env: NodeJS.ProcessEnv = {}) => {
  const out: string[] = [];
  const err: string[] = [];
  const run = (argv: string[]) =>
    runConfigCommand(argv, {
      out: (t) => out.push(t),
      err: (t) => err.push(t),
      env,
      readConfig: () => file,
    });
  return { run, out, err, text: () => out.join("\n") };
};

describe("openmasq-proxy config", () => {
  it("show: every setting with its value and its source — and never the always-terms themselves", async () => {
    const h = harness(FILE, { OPENMASQ_PROXY_MODE: "token" });
    expect(await h.run(["show", "--port", "9000", "--", "hermes"])).toBe(0);
    const text = h.text();
    expect(text).toMatch(/port\s+9000\s+flag/);
    expect(text).toMatch(/mode\s+token\s+env/);
    expect(text).toMatch(/level\s+renforce\s+file › run/);
    expect(text).toMatch(/open\s+true\s+file › clients.hermes/);
    expect(text).toMatch(/theme\s+auto\s+default/);
    expect(text).toMatch(/always\s+2 term\(s\)/);
    expect(text).not.toContain("Acme");
    expect(text).not.toContain("Rebour");
  });

  it("show --json carries the same rows for a machine", async () => {
    const h = harness(FILE);
    expect(await h.run(["show", "--json"])).toBe(0);
    const doc = JSON.parse(h.text()) as {
      settings: { name: string; value: string; source: string }[];
    };
    expect(doc.settings.find((s) => s.name === "level")).toEqual({
      name: "level",
      value: "renforce",
      source: "file",
    });
  });

  it("path says which file is read, and whether it exists; a bad run refuses like the run would", async () => {
    const present = harness(FILE);
    expect(await present.run(["path"])).toBe(0);
    expect(present.text()).toMatch(/proxy\.json$/);
    const absent = harness(undefined);
    expect(await absent.run(["path"])).toBe(0);
    expect(absent.text()).toContain("absent");
    const bad = harness('{"run":{"levl":"strict"}}');
    expect(await bad.run(["show"])).toBe(2);
    expect(bad.err.join("\n")).toContain('did you mean "level"');
  });

  it("schema is generated from the table: every file option, no per-run flag, closed objects", () => {
    const schema = jsonSchema() as {
      properties: { run: { properties: Record<string, unknown>; additionalProperties: boolean } };
    };
    const props = schema.properties.run.properties;
    expect(Object.keys(props)).toContain("level");
    expect(Object.keys(props)).toContain("mcpWrites");
    expect(Object.keys(props)).not.toContain("reveal");
    expect(schema.properties.run.additionalProperties).toBe(false);
    expect(props.level).toMatchObject({ enum: ["standard", "renforce", "strict"] });
  });

  it("prints its usage without a command, and refuses one it does not know", async () => {
    const h = harness();
    expect(await h.run([])).toBe(2);
    expect(h.text()).toContain("openmasq-proxy config <command>");
    expect(await h.run(["reset"])).toBe(2);
  });
});
