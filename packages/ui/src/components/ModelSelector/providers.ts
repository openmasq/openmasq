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
  // L'abonnement Claude de l'utilisateur (CLI Claude Code) — n'apparaît que si la CLI
  // est détectée ET le réglage activé (`claudeCliReady`, sinon la ligne est masquée).
  "claude-cli",
  // L'abonnement ChatGPT de l'utilisateur (CLI Codex) — n'apparaît que si la CLI est
  // détectée ET le réglage activé (`codexCliReady`, sinon la ligne est masquée).
  "codex-cli",
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
  return PROVIDERS[pid].label;
}
