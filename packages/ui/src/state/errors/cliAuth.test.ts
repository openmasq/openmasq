// A subscription CLI whose OWN session expired: main sends `CLI_AUTH:<cli> · <raw>`, and
// the person reads the catalogue's sentence — never the CLI's raw text, never « your key ».
import { getMessages } from "@openmasq/i18n";
import { cliAuthWire } from "@openmasq/llm";
import { describe, expect, it } from "vitest";
import { humanizeSendError, sendErrorAction, sendErrorReason } from "./";

const fr = getMessages("fr");
const en = getMessages("en");
const RAW = 'Failed to authenticate. API Error: 401 {"type":"error","error":{"type":"authentication_error"}}';

describe("CLI_AUTH — a signed-out subscription CLI", () => {
  it("speaks the catalogue in both languages, without the raw CLI text", () => {
    const wire = cliAuthWire("claude", RAW);
    const said = humanizeSendError(wire, fr, { provider: "claude-cli" });
    expect(said).toBe(fr.errors.cliSessionExpired("Claude Code"));
    expect(said).toContain("Votre session Claude Code a expiré");
    expect(humanizeSendError(wire, en)).toBe("Your Claude Code session has expired. Sign in again to continue.");
    expect(said).not.toContain("authentication_error");
  });

  it("is never read as a refused API key, even though the raw text says authentication_error", () => {
    const wire = cliAuthWire("claude", RAW);
    expect(humanizeSendError(wire, fr, { provider: "claude-cli" })).not.toBe(fr.errors.invalidKeyNamed("Claude Code"));
    expect(sendErrorAction(wire, "claude-cli")?.kind).toBe("cli_signin");
  });

  it("offers the in-app sign-in for claude and codex, wrapped by Electron or not", () => {
    expect(sendErrorAction(cliAuthWire("codex", "401 Unauthorized"))).toEqual({
      kind: "cli_signin",
      provider: "codex-cli",
      label: "Codex",
    });
    const wrapped = `Error invoking remote method 'chat:complete-tools': Error: ${cliAuthWire("claude")}`;
    expect(sendErrorAction(wrapped)).toEqual({ kind: "cli_signin", provider: "claude-cli", label: "Claude Code" });
  });

  it("antigravity: the text sends the person to the tool itself, and no button is offered", () => {
    const wire = cliAuthWire("antigravity", "You are not logged into Antigravity.");
    expect(humanizeSendError(wire, fr)).toBe(fr.errors.cliSessionExpiredExternal("Antigravity"));
    expect(sendErrorAction(wire, "antigravity-cli")).toBeUndefined();
  });

  it("counts as an auth failure in analytics", () => {
    expect(sendErrorReason(cliAuthWire("antigravity", "You are not logged into Antigravity."))).toBe("auth");
  });

  it("an ordinary CLI failure keeps its own path", () => {
    expect(sendErrorAction("Claude AI usage limit reached|1767225600", "claude-cli")).toBeUndefined();
    expect(humanizeSendError("La CLI s'est arrêtée avec le code 2.", fr)).toBeNull();
  });
});
