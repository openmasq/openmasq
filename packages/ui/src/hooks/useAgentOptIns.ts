import type { ProviderId, SubscriptionAccount } from "@openmasq/llm";
import { useHost } from "../host";
import { useT } from "../i18n";
import { useCliDetected } from "../state/effects/useAvailabilityProbes";

/** The CLI behind an agent provider — what the account card asks by name. */
export type AgentCli = SubscriptionAccount["cli"];

/** The copy of ONE agent, as it lives in `@openmasq/i18n` (`modelPicker.cli.*`). */
export interface AgentCopy {
  title: string;
  note: string;
  rowTitle: string;
  onDesc: string;
  missingDesc: string;
}

/** One subscription CLI the user can opt into: its provider, its probe, its switch. */
export interface AgentOptIn {
  pid: ProviderId;
  cli: AgentCli;
  copy: AgentCopy;
  /** `false` = binary absent from this machine, `null` = not (yet) probed. */
  detected: boolean | null;
  enabled: boolean;
  onEnabled: (on: boolean) => void;
}

/** The three opt-ins (`Settings.*CliEnabled`) and their writers, as the caller holds them. */
export interface AgentOptInInput {
  claudeCliEnabled?: boolean;
  onClaudeCliEnabled?: (on: boolean) => void;
  codexCliEnabled?: boolean;
  onCodexCliEnabled?: (on: boolean) => void;
  antigravityCliEnabled?: boolean;
  onAntigravityCliEnabled?: (on: boolean) => void;
}

/**
 * The agents this build can offer — ONE list for every surface that offers them
 * (Réglages → Modèles, the onboarding's « Accès aux modèles » step), so the two never
 * disagree on which CLI exists, what it is called, or whether it was found.
 *
 * An agent whose host can't probe its CLI, or whose setting isn't wired, is NOT listed:
 * promising a connection the platform can't honor would be a lie. The probes are called
 * unconditionally (the hooks rule); each returns `null` when the host lacks its slot.
 */
export function useAgentOptIns(input: AgentOptInInput): AgentOptIn[] {
  const t = useT();
  const host = useHost();
  const claudeDetected = useCliDetected(host, "probeClaudeCli");
  const codexDetected = useCliDetected(host, "probeCodexCli");
  const antigravityDetected = useCliDetected(host, "probeAntigravityCli");

  const agents: AgentOptIn[] = [];
  if (host.probeClaudeCli && input.onClaudeCliEnabled)
    agents.push({
      pid: "claude-cli",
      cli: "claude",
      copy: t.modelPicker.cli.claude,
      detected: claudeDetected,
      enabled: !!input.claudeCliEnabled,
      onEnabled: input.onClaudeCliEnabled,
    });
  if (host.probeCodexCli && input.onCodexCliEnabled)
    agents.push({
      pid: "codex-cli",
      cli: "codex",
      copy: t.modelPicker.cli.codex,
      detected: codexDetected,
      enabled: !!input.codexCliEnabled,
      onEnabled: input.onCodexCliEnabled,
    });
  if (host.probeAntigravityCli && input.onAntigravityCliEnabled)
    agents.push({
      pid: "antigravity-cli",
      cli: "antigravity",
      copy: t.modelPicker.cli.antigravity,
      detected: antigravityDetected,
      enabled: !!input.antigravityCliEnabled,
      onEnabled: input.onAntigravityCliEnabled,
    });
  return agents;
}
