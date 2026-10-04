import { describe, expect, it } from "vitest";
import {
  SUBSCRIPTION_CLI_PROVIDER,
  cliAuthOf,
  cliAuthWire,
  subscriptionCliOfProvider,
} from "./subscriptionSetup";

describe("CLI_AUTH wire code", () => {
  it("round-trips the CLI through the message main sends, raw detail included", () => {
    for (const cli of ["claude", "codex", "antigravity"] as const) {
      expect(cliAuthOf(cliAuthWire(cli, "Invalid API key · Please run /login"))).toBe(cli);
      expect(cliAuthOf(cliAuthWire(cli))).toBe(cli);
    }
  });

  it("survives the Electron invoke wrapper (chat:complete rejects with it)", () => {
    const wrapped = `Error invoking remote method 'chat:complete': Error: ${cliAuthWire("codex", "401")}`;
    expect(cliAuthOf(wrapped)).toBe("codex");
  });

  it("never reads another error as a session failure", () => {
    for (const m of ["", "CREDITS_EXHAUSTED", "API Error: 401 authentication_error", "CLI_AUTH:gemini", "XCLI_AUTH:claude"]) {
      expect(cliAuthOf(m)).toBeNull();
    }
  });

  it("bounds the raw detail and flattens it onto one line", () => {
    const wire = cliAuthWire("claude", `a\n\nb ${"x".repeat(1000)}`);
    expect(wire.startsWith("CLI_AUTH:claude · a b ")).toBe(true);
    expect(wire.length).toBeLessThan(450);
  });
});

describe("subscription CLI ↔ provider", () => {
  it("maps each CLI to its provider and back", () => {
    for (const [cli, provider] of Object.entries(SUBSCRIPTION_CLI_PROVIDER)) {
      expect(subscriptionCliOfProvider(provider)).toBe(cli);
    }
    expect(subscriptionCliOfProvider("anthropic")).toBeNull();
  });
});
