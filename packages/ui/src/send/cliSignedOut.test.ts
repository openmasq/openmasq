import { getMessages } from "@openmasq/i18n";
import { describe, expect, it } from "vitest";
import { pickerBlocks, pickerHides, unavailableLabel, modelUnavailableReason, visibleModels } from "./modelAvailability";
import { preflightError, type PreflightInput } from "./preflight";

// A subscription CLI whose OWN status said « signed out »: the picker greys it with the
// reason, the send gate refuses BEFORE any call, with the in-app sign-in when there is one.
const fr = getMessages("fr");

function input(over: Partial<PreflightInput>): PreflightInput {
  return {
    orgProfile: null,
    personalCredits: null,
    personalSub: null,
    keyConfigured: new Set(),
    hasBilling: false,
    provider: "claude-cli",
    model: { id: "claude-cli", label: "Claude Code" },
    effectivePlatform: false,
    openaiCompatBaseUrl: "",
    t: fr,
    ...over,
  };
}

describe("a signed-out subscription CLI", () => {
  it("is refused before any call, with the reason and « Se reconnecter »", () => {
    const r = preflightError(input({ claudeCliReady: "signed_out" }));
    expect(r?.text).toBe(fr.availability.cliSignedOutTitle("Claude Code"));
    expect(r?.action).toEqual({ kind: "cli_signin", provider: "claude-cli", label: "Claude Code" });
  });

  it("codex too; antigravity (no in-app sign-in) gets the text alone", () => {
    const codex = preflightError(input({ provider: "codex-cli", model: { id: "codex-cli", label: "Codex" }, codexCliReady: "signed_out" }));
    expect(codex?.action?.kind).toBe("cli_signin");
    const agy = preflightError(
      input({ provider: "antigravity-cli", model: { id: "antigravity-cli", label: "Antigravity" }, antigravityCliReady: "signed_out" }),
    );
    expect(agy?.text).toBe(fr.availability.cliSignedOutTitle("Antigravity"));
    expect(agy?.action).toBeUndefined();
  });

  it("ready (signed in, or status unknown) passes; absent stays « CLI requise »", () => {
    expect(preflightError(input({ claudeCliReady: true }))).toBeNull();
    expect(preflightError(input({ claudeCliReady: null }))?.text).toBe(fr.availability.cliUnavailable("Claude Code"));
  });

  it("stays VISIBLE in the picker, greyed with its own chip", () => {
    expect(pickerHides("cli_signed_out")).toBe(false);
    expect(pickerBlocks("cli_signed_out")).toBe(true);
    expect(unavailableLabel("cli_signed_out", "Claude Code", fr)).toEqual({
      chip: "Non connecté",
      title: fr.availability.cliSignedOutTitle("Claude Code"),
    });
    const reason = modelUnavailableReason({
      model: { id: "claude-cli", provider: "claude-cli" },
      effectivePlatform: false,
      orgProfile: null,
      personalCredits: null,
      keyConfigured: new Set(),
      openaiCompatBaseUrl: "",
      claudeCliReady: "signed_out",
    });
    expect(reason).toBe("cli_signed_out");
    const shown = visibleModels([{ id: "claude-cli" }], new Map([["claude-cli", reason!]]));
    expect(shown).toHaveLength(1);
  });
});
