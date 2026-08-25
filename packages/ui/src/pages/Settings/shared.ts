import type { ProviderId } from "@openmasq/llm";
// Providers that show an API-key gear. `scaleway` is absent BY DESIGN: it runs only on
// the app's key (abonnement), a user cannot bring their own. `openrouter` is here AND
// platform-served — its key is optional, it buys the full catalogue instead of the
// curated subscription set.
export const KEYED_PROVIDERS: ProviderId[] = [
  "openai",
  "anthropic",
  "google",
  "mistral",
  "deepseek",
  "openrouter",
];

// Providers that can run the redaction model (a one-shot completion).
export const REDACT_PROVIDERS: ProviderId[] = [
  "mistral",
  "openai-compat",
  "openai",
  "anthropic",
  "google",
];

export type ImportState = {
  state: "idle" | "running" | "done" | "error";
  loaded?: number;
  total?: number;
  message?: string;
};

export type TestState = { state: "idle" | "testing" | "ok" | "error"; message?: string };

/** Compact relative time for the recent-redactions table. */
export function relTime(ts: number): string {
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  if (d === 1) return "Hier";
  if (d < 7) return `${d} j`;
  return new Date(ts).toLocaleDateString();
}
