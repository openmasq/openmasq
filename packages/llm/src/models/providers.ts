import { BRAND } from "@openmasq/branding";
import type { ProviderInfo, ProviderId } from "../types.js";

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  openai: {
    id: "openai",
    label: "OpenAI",
    keyUrl: "https://platform.openai.com/api-keys",
    hostCountry: { code: "US", label: "Hébergé aux États-Unis" },
  },
  anthropic: {
    id: "anthropic",
    label: "Anthropic",
    keyUrl: "https://console.anthropic.com/settings/keys",
    hostCountry: { code: "US", label: "Hébergé aux États-Unis" },
  },
  google: {
    id: "google",
    label: "Google Gemini",
    keyUrl: "https://aistudio.google.com/app/apikey",
    hostCountry: { code: "US", label: "Hébergé aux États-Unis" },
  },
  mistral: {
    id: "mistral",
    label: "Mistral",
    keyUrl: "https://console.mistral.ai/api-keys",
    // OpenAI-compatible endpoint, so it streams through the OpenAI provider.
    defaultBaseUrl: "https://api.mistral.ai/v1",
    // Mistral's hosted API serves from the EU (France).
    hostCountry: { code: "FR", label: "Hébergé en France (UE)" },
  },
  deepseek: {
    id: "deepseek",
    label: "DeepSeek",
    keyUrl: "https://platform.deepseek.com/api_keys",
    // OpenAI-compatible endpoint, so it streams through the OpenAI provider path.
    defaultBaseUrl: "https://api.deepseek.com/v1",
    // DeepSeek's hosted API serves from China — surface it honestly (data residency).
    hostCountry: { code: "CN", label: "Hébergé en Chine" },
  },
  openrouter: {
    id: "openrouter",
    label: "OpenRouter",
    // DUAL-MODE, and the ONLY one: a user's OWN key sends DIRECT; without a key, the
    // CURATED ids of `PLATFORM_OPENROUTER_IDS` route through the platform gateway on
    // the platform key, metered on the subscription's credits (a `:free` tier costs
    // nothing and needs neither). A dynamically-discovered slug is BYO-only.
    // One key, hundreds of models from many vendors; OpenAI-compatible
    // `/chat/completions`, so it streams through the OpenAI path.
    keyUrl: "https://openrouter.ai/keys",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    // A multi-vendor aggregator: the actual inference host depends on which upstream
    // model is picked, so show the neutral "global" indicator, not a country flag.
    hostCountry: { code: "global", label: "Passerelle multi-modèles — hébergement variable" },
  },
  scaleway: {
    id: "scaleway",
    label: `Scaleway (${BRAND.name})`,
    // PLATFORM-PROVIDED: no user API key. Routed through the platform backend (which
    // holds the platform's Scaleway key) and metered on the prepaid credit budget —
    // subscription only. OpenAI-compatible endpoint.
    defaultBaseUrl: "https://api.scaleway.ai/v1",
    // Scaleway is a French cloud — EU/RGPD data residency.
    hostCountry: { code: "FR", label: "Hébergé en France (UE)" },
  },
  "openai-compat": {
    id: "openai-compat",
    label: "OpenAI-compatible / Local",
    customBaseUrl: true,
    defaultBaseUrl: "http://localhost:11434/v1",
    // Runs on the user's OWN machine (Ollama) — the strongest privacy posture.
    hostCountry: { code: "local", label: "Exécuté en local (votre machine)" },
  },
  "openai-session": {
    id: "openai-session",
    label: "ChatGPT (no API key)",
    keyless: true,
    hostCountry: { code: "US", label: "Hébergé aux États-Unis" },
  },
  "anthropic-session": {
    id: "anthropic-session",
    label: "Claude (no API key)",
    keyless: true,
    hostCountry: { code: "US", label: "Hébergé aux États-Unis" },
  },
  "claude-cli": {
    id: "claude-cli",
    // The user's Claude SUBSCRIPTION, via their Claude Code CLI installed and already
    // connected (headless). Keyless by nature: auth lives in the CLI, never here.
    label: "Claude Code",
    keyless: true,
    hostCountry: { code: "US", label: "Hébergé aux États-Unis" },
  },
  "codex-cli": {
    id: "codex-cli",
    // The user's ChatGPT subscription, via their Codex CLI installed and connected
    // ("Sign in with ChatGPT"). Same pattern as claude-cli.
    label: "Codex",
    keyless: true,
    hostCountry: { code: "US", label: "Hébergé aux États-Unis" },
  },
};
