import { PROVIDERS, type ProviderId } from "@openmasq/llm";
import { BRAND } from "@openmasq/branding";
import { subscriptionsSold } from "../../send/platformAccess";

/**
 * Shared provider presentation for the model pickers (the chat Finder + the Settings
 * grid): the display ORDER and the group LABEL (Scaleway wears the brand name).
 * Single-sourced here (rule 9) so both pickers agree.
 */

/** The chat picker's provider order (platform-first, then BYO). No web-session
 *  providers — the desktop has none. */
export const PROVIDER_ORDER: ProviderId[] = [
  "scaleway",
  // The user's Claude subscription (Claude Code CLI) — only appears if the CLI
  // is detected AND the setting enabled (`claudeCliReady`, otherwise the row is hidden).
  "claude-cli",
  // The user's ChatGPT subscription (Codex CLI) — only appears if the CLI is
  // detected AND the setting enabled (`codexCliReady`, otherwise the row is hidden).
  "codex-cli",
  // The Google Antigravity subscription (`agy` CLI) — same display rule.
  "antigravity-cli",
  "openai",
  "anthropic",
  "google",
  "mistral",
  "deepseek",
  "openrouter",
  "openai-compat",
];

/** The group header a provider shows: Scaleway (the subscription-only platform) wears
 *  the brand name; everyone else uses the registry label. */
export function providerGroupLabel(pid: ProviderId): string {
  if (pid === "scaleway") {
    return subscriptionsSold() ? `${BRAND.name} — inclus dans l'abonnement` : `${BRAND.name} — inclus avec votre compte`;
  }
  if (pid === "claude-cli") return "Claude Code — votre abonnement Claude";
  if (pid === "codex-cli") return "Codex — votre abonnement ChatGPT";
  if (pid === "antigravity-cli") return "Antigravity — votre abonnement Google";
  return PROVIDERS[pid].label;
}
