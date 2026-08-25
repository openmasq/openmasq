import { PROVIDERS, type ProviderId } from "@openmasq/llm";
import { BRAND } from "@openmasq/branding";

/**
 * Shared provider presentation for the model pickers (the chat Finder + the Settings
 * grid): the display ORDER and the group LABEL (Scaleway wears the brand name).
 * Single-sourced here (rule 9) so both pickers agree.
 */

/** The chat picker's provider order (platform-first, then BYO). No web-session
 *  providers — the desktop has none. */
export const PROVIDER_ORDER: ProviderId[] = [
  "scaleway",
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
  if (pid === "scaleway") return `${BRAND.name} — inclus dans l'abonnement`;
  return PROVIDERS[pid].label;
}
