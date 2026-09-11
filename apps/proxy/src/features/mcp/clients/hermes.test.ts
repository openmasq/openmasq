import { describe, expect, it } from "vitest";
import { hermesConfig, readDefaultModel, HERMES } from "./hermes";

describe("hermes — the config we hand it", () => {
  it("routes the model through the proxy and declares OUR endpoint as the only MCP server", () => {
    const yaml = hermesConfig("http://127.0.0.1:8787", "anthropic/claude-opus-4.6");
    expect(yaml).toContain('base_url: "http://127.0.0.1:8787/v1"');
    expect(yaml).toContain("openmasq:");
    expect(yaml).toContain('url: "http://127.0.0.1:8787/mcp"');
    expect(yaml).toContain('default: "anthropic/claude-opus-4.6"');
    // The key is referenced, never copied.
    expect(yaml).toContain("api_key: ${OPENAI_API_KEY}");
    // The mcp_servers block is EXACTLY our one endpoint — exclusivity by construction.
    expect(yaml.slice(yaml.indexOf("mcp_servers:"))).toBe(
      'mcp_servers:\n  openmasq:\n    url: "http://127.0.0.1:8787/mcp"\n',
    );
  });

  it("omits the model default when the user's config has none", () => {
    expect(hermesConfig("http://x:1", undefined)).not.toContain("default:");
  });
});

describe("hermes — reading the user's default model without a YAML dep", () => {
  it("reads default: from inside the model: block, quoted or bare", () => {
    expect(readDefaultModel('model:\n  default: "openai/gpt-5"\n  provider: auto\n')).toBe(
      "openai/gpt-5",
    );
    expect(readDefaultModel("model:\n  provider: auto\n  default: anthropic/claude\n")).toBe(
      "anthropic/claude",
    );
  });
  it("does not read a default: from another block", () => {
    expect(readDefaultModel("auxiliary:\n  default: glm-4.7\nmodel:\n  provider: auto\n")).toBe(
      undefined,
    );
  });
  it("returns undefined when there is no model block or no default", () => {
    expect(readDefaultModel("mcp_servers:\n  x:\n    url: y\n")).toBe(undefined);
    expect(readDefaultModel("model:\n  provider: custom\n")).toBe(undefined);
  });
});

describe("hermes — exclusivity", () => {
  it("blocks when Hermes is not set up (no config.yaml under the home)", () => {
    const out = HERMES.exclusive({
      configPath: "/tmp/x/mcp.json",
      dir: "/tmp/x",
      url: "http://127.0.0.1:8787/mcp",
      own: [],
      env: { HERMES_HOME: "/nonexistent-openmasq-test-home" } as NodeJS.ProcessEnv,
    });
    expect("blocked" in out && out.blocked).toMatch(/not set up/);
  });
});
