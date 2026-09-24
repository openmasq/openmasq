import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { hermesConfigFrom, wireBaseUrl, HERMES } from "./hermes";

const R = "http://127.0.0.1:8787";

describe("hermes — the wire matches whatever provider is connected", () => {
  it("Anthropic (and any claude model) reaches the proxy ROOT — /v1/messages is appended", () => {
    expect(wireBaseUrl(R, "anthropic", "claude-opus-5")).toBe(R);
    expect(wireBaseUrl(R, "auto", "anthropic/claude-opus-4.6")).toBe(R);
  });
  it("Gemini takes the root; an OpenAI-compatible provider takes /v1", () => {
    expect(wireBaseUrl(R, "gemini", "gemini-2.5")).toBe(R);
    expect(wireBaseUrl(R, "custom", "gpt-5")).toBe(`${R}/v1`);
    expect(wireBaseUrl(R, "openrouter", "x")).toBe(`${R}/v1`);
  });
});

describe("hermes — config is the user's own, only base_url and mcp_servers change", () => {
  const userYaml = [
    "database:",
    "  journal_mode: wal",
    "model:",
    '  default: "claude-opus-5"',
    "  provider: anthropic",
    "  headers:",
    '    X-Trace: "1"',
    "mcp_servers:",
    "  gmail:",
    '    url: "https://gmail.example/mcp"',
    "  legacy:",
    "    command: npx",
  ].join("\n");

  it("keeps provider/model/headers, redirects base_url to the Anthropic wire, no key added", () => {
    const doc = parse(hermesConfigFrom(userYaml, R));
    expect(doc.model.provider).toBe("anthropic"); // preserved
    expect(doc.model.default).toBe("claude-opus-5"); // preserved
    expect(doc.model.headers).toEqual({ "X-Trace": "1" }); // preserved
    expect(doc.model.base_url).toBe(R); // redirected, Anthropic wire → root
    expect(doc.model.api_key).toBeUndefined(); // the user's auth is never touched
    expect(doc.database).toEqual({ journal_mode: "wal" }); // every other setting kept
  });

  it("replaces the user's MCP servers with OUR endpoint alone (exclusive by construction)", () => {
    const doc = parse(hermesConfigFrom(userYaml, R));
    expect(doc.mcp_servers).toEqual({ openmasq: { url: `${R}/mcp` } });
  });
});

describe("hermes — exclusivity blocks when not set up", () => {
  it("blocks when there is no config.yaml under the home", () => {
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
