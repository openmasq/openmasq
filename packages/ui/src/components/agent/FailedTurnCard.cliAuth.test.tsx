// @vitest-environment jsdom
// A turn a subscription CLI refused for its SESSION: the card says so in the person's
// language, offers « Se reconnecter », and never shows what the CLI printed.
import { getMessages } from "@openmasq/i18n";
import { cliAuthWire } from "@openmasq/llm";
import { describe, expect, it, vi } from "vitest";
import { humanizeSendError, sendErrorAction } from "../../state/errors";
import { mount } from "../../testKit";
import { FailedTurnCard } from "./FailedTurnCard";

const RAW = "Invalid API key · Please run /login";

async function card(locale: "fr" | "en", cli: "claude" | "antigravity" = "claude") {
  const t = getMessages(locale);
  const wire = cliAuthWire(cli, RAW);
  const text = humanizeSendError(wire, t, { provider: cli === "claude" ? "claude-cli" : "antigravity-cli" })!;
  const action = sendErrorAction(wire, cli === "claude" ? "claude-cli" : "antigravity-cli");
  const onAction = vi.fn();
  const ui = await mount(
    <FailedTurnCard
      assistantId="a1"
      text={text}
      action={action as Parameters<typeof FailedTurnCard>[0]["action"]}
      onAction={onAction}
      onRetry={() => {}}
    />,
  );
  return { ui, onAction };
}

describe("FailedTurnCard — a signed-out subscription CLI", () => {
  it("FR: the session sentence, « Session expirée », « Se reconnecter » — never the raw text", async () => {
    const { ui, onAction } = await card("fr");
    expect(ui.el.textContent).toContain("Votre session Claude Code a expiré. Reconnectez-vous pour continuer.");
    expect(ui.el.textContent).toContain("Session expirée");
    expect(ui.el.textContent).not.toContain("Please run /login");
    expect(ui.el.textContent).not.toContain("Clé requise");
    await ui.click(".btn-primary");
    expect(onAction).toHaveBeenCalledWith("a1", { kind: "cli_signin", provider: "claude-cli", label: "Claude Code" });
    await ui.unmount();
  });

  it("EN: the same card in English", async () => {
    const { ui } = await card("en");
    expect(ui.el.textContent).toContain("Your Claude Code session has expired. Sign in again to continue.");
    expect(ui.el.textContent).not.toContain("Invalid API key");
    await ui.unmount();
  });

  it("antigravity: where to sign in, and « Réessayer » as the only button", async () => {
    const { ui } = await card("fr", "antigravity");
    expect(ui.el.textContent).toContain("Reconnectez-vous depuis Antigravity, puis réessayez.");
    expect(ui.findAll("button")).toHaveLength(1);
    await ui.unmount();
  });
});
