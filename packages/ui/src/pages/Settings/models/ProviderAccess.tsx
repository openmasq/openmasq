import { useState } from "react";
import { PROVIDERS, isPlatformProvider, type ProviderId } from "@openmasq/llm";
import { AnimatePresence } from "framer-motion";
import { ModelLogo, ArrowRightIcon } from "../../../components/brand";
import { KEYED_PROVIDERS } from "../shared";
import { BRAND } from "@openmasq/branding";
import { subscriptionsSold } from "../../../send/platformAccess";
import { useHost } from "../../../host";
import { useCliDetected } from "../../../state/effects/useAvailabilityProbes";
import { AgentAccessModal, type AgentCopy } from "./AgentAccessModal";
import type { AgentCli } from "./AgentAccountCard";

import { useT } from "../../../i18n";
/**
 * "Where your models come from" — the head of Réglages → Modèles. Two groups, because
 * they are two different CONNECTIONS and merging them would suggest otherwise:
 *  · a KEY buys tokens from an API, per call, on the user's own account;
 *  · an AGENT is a CLI already installed and already paid for (a Claude Code or
 *    ChatGPT subscription) — nothing to paste, nothing billed here, and it only
 *    works as long as the tool is on THIS machine.
 * Showing an "Anthropic key" field to someone with a Claude Code subscription makes
 * them paste a key they don't need: the separation is what prevents that.
 *
 * **One chip = ONE gesture.** A key opens its key modal, an agent opens its
 * opt-in (`AgentAccessModal`): nothing nested, no doubt about what the click does.
 * Acquired state stays discreet (filled chip + brand dot) — this grid is a
 * STATE first, an invitation second.
 *
 * ⚠️ Two things that must stay true:
 * - **The subscription is an ACCOUNT fact, not a provider one.** It unlocks Scaleway +
 *   the curated OpenRouter set and NOTHING else: so it lives ONCE, under the groups. On
 *   the OpenAI chip it would sell inference the platform doesn't serve.
 * - **OpenRouter's OAuth (PKCE) lives in the key modal**, beside the paste field
 *   — same place, two roads to the same key, and the chip stays one single gesture.
 *
 * **Account managed by an organization**: the key group gives way to ONE sentence.
 * Personal keys are refused there (the organization supplies the models and pays for
 * calls; a personal key would be an exit its policy can't see), and main
 * refuses the write anyway. Showing inert chips would make you wonder
 * why the click does nothing — the state is said, once, right where you came to act.
 */
export function ProviderAccess({
  keyConfigured,
  hasSubscription,
  onOpenKey,
  onOpenBilling,
  byoKeysBlocked = false,
  organizationName,
  claudeCliEnabled,
  onClaudeCliEnabled,
  codexCliEnabled,
  onCodexCliEnabled,
  antigravityCliEnabled,
  onAntigravityCliEnabled,
}: {
  keyConfigured?: ReadonlySet<string>;
  /** The organization forbids personal keys — the group gives way to the state. */
  byoKeysBlocked?: boolean;
  /** Named when known: "your organization" is vague, "Acme" is a fact. */
  organizationName?: string;
  /** The account draws on platform credits (subscription or org) — so the platform
   *  providers are already usable without a personal key. */
  hasSubscription: boolean;
  onOpenKey: (p: ProviderId) => void;
  onOpenBilling?: () => void;
  /** Opt-in `Settings.claudeCliEnabled` / `codexCliEnabled` — an agent whose host can't
   *  probe its CLI, or whose setting isn't wired, isn't drawn: promising a connection
   *  the platform can't honor would be a lie. */
  claudeCliEnabled?: boolean;
  onClaudeCliEnabled?: (on: boolean) => void;
  codexCliEnabled?: boolean;
  onCodexCliEnabled?: (on: boolean) => void;
  antigravityCliEnabled?: boolean;
  onAntigravityCliEnabled?: (on: boolean) => void;
}) {
  const t = useT();
  const host = useHost();
  /** The agent whose opt-in is open (`null` = none). */
  const [agentOpen, setAgentOpen] = useState<ProviderId | null>(null);
  // The probes are called unconditionally (the hooks rule); each returns
  // `null` when the host doesn't have its slot.
  const claudeDetected = useCliDetected(host, "probeClaudeCli");
  const codexDetected = useCliDetected(host, "probeCodexCli");
  const antigravityDetected = useCliDetected(host, "probeAntigravityCli");

  /** OpenRouter first: the only provider reachable BOTH ways. */
  const order: ProviderId[] = ["openrouter", ...KEYED_PROVIDERS.filter((p) => p !== "openrouter")];

  interface Agent {
    pid: ProviderId;
    /** The CLI behind the provider — what the account card asks. */
    cli: AgentCli;
    copy: AgentCopy;
    detected: boolean | null;
    enabled: boolean;
    onEnabled: (on: boolean) => void;
  }
  const agents: Agent[] = [];
  if (host.probeClaudeCli && onClaudeCliEnabled)
    agents.push({
      pid: "claude-cli",
      cli: "claude",
      copy: t.modelPicker.cli.claude,
      detected: claudeDetected,
      enabled: !!claudeCliEnabled,
      onEnabled: onClaudeCliEnabled,
    });
  if (host.probeCodexCli && onCodexCliEnabled)
    agents.push({
      pid: "codex-cli",
      cli: "codex",
      copy: t.modelPicker.cli.codex,
      detected: codexDetected,
      enabled: !!codexCliEnabled,
      onEnabled: onCodexCliEnabled,
    });
  if (host.probeAntigravityCli && onAntigravityCliEnabled)
    agents.push({
      pid: "antigravity-cli",
      cli: "antigravity",
      copy: t.modelPicker.cli.antigravity,
      detected: antigravityDetected,
      enabled: !!antigravityCliEnabled,
      onEnabled: onAntigravityCliEnabled,
    });
  const open = agents.find((a) => a.pid === agentOpen);

  return (
    <>
      {/* Organization: the state, ONE sentence, in place of the key group — above
          the grid, not inside it (it isn't a third path). */}
      {byoKeysBlocked && (
        <p className="provider-grid-note org-managed-note">
          <strong>{t.modelsTab.orgProvidesModels(organizationName ?? t.modelsTab.yourOrg)}</strong>{" "}
          {t.modelsTab.orgKeysBlocked}
        </p>
      )}
      {(!byoKeysBlocked || agents.length > 0) && (
        <div className="source-groups">
          {!byoKeysBlocked && (
            <section className="source-group">
              <div className="source-group-title">{t.modelsTab.keysGroupTitle}</div>
              <p className="source-group-sub">{t.modelsTab.keysGroupSub}</p>
              <div className="source-chips">
                {order.map((pid) => {
                  const label = PROVIDERS[pid].label;
                  const hasKey = !!keyConfigured?.has(pid);
                  // Covered WITHOUT a key: only a platform provider can be, and
                  // only if the account has the means to pay for it.
                  const covered = !hasKey && isPlatformProvider(pid) && hasSubscription;
                  const ready = hasKey || covered;
                  return (
                    <button
                      key={pid}
                      type="button"
                      className={`source-chip${ready ? " on" : ""}`}
                      onClick={() => onOpenKey(pid)}
                      title={`${hasKey ? t.modelsTab.editKey(label) : t.modelsTab.addKeyFor(label)}${
                        ready ? ` · ${hasKey ? t.modelsTab.keySaved : t.modelsTab.included}` : ""
                      }`}
                    >
                      <ModelLogo provider={pid} size={15} />
                      <span className="source-chip-name">{label}</span>
                      {/* OpenRouter is RECOMMENDED, and saying so here spares five accounts
                        from being opened: a single key reaches every model. */}
                      {pid === "openrouter" && (
                        <span className="source-chip-best">{t.modelsTab.recommended}</span>
                      )}
                      {ready && <span className="source-chip-dot" aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {agents.length > 0 && (
            <section className="source-group">
              <div className="source-group-title">{t.modelsTab.agentsGroupTitle}</div>
              <p className="source-group-sub">{t.modelsTab.agentsGroupSub}</p>
              <div className="source-chips">
                {agents.map((a) => {
                  const label = PROVIDERS[a.pid].label;
                  return (
                    <button
                      key={a.pid}
                      type="button"
                      className={`source-chip${a.enabled ? " on" : ""}${a.detected === false ? " missing" : ""}`}
                      onClick={() => setAgentOpen(a.pid)}
                      title={
                        a.detected === false
                          ? t.modelsTab.agentMissing(label)
                          : a.enabled
                            ? t.modelsTab.agentOn(label)
                            : t.modelsTab.agentTip(label)
                      }
                    >
                      <ModelLogo provider={a.pid} size={15} />
                      <span className="source-chip-name">{label}</span>
                      {a.enabled && <span className="source-chip-dot" aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      )}

      {/* The subscription, ONCE: it's an account fact, not a provider one — and
          only in a build that SELLS (`subscriptionsSold`, off by default). */}
      {subscriptionsSold() && !hasSubscription && onOpenBilling && (
        <p className="provider-grid-note">
          {t.modelsTab.noKeySubscription(BRAND.name)}{" "}
          <button type="button" className="lnk" onClick={onOpenBilling}>
            {t.billing.ctaUpgrade} <ArrowRightIcon size={12} />
          </button>
        </p>
      )}

      <AnimatePresence>
        {open && (
          <AgentAccessModal
            copy={open.copy}
            cli={open.cli}
            detected={open.detected}
            enabled={open.enabled}
            onEnabled={open.onEnabled}
            onClose={() => setAgentOpen(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
