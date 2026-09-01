import type { Messages } from "@openmasq/i18n";
import { PROVIDERS, type ProviderId } from "@openmasq/llm";

/**
 * Per-PROVIDER "where to find your API key" help — the data behind the detailed
 * tutorial shown in `ApiKeyModal` and the onboarding's key step
 * (`pages/Onboarding/KeySteps.tsx`), mirroring the MCP connector key flow
 * (`Settings/mcpApiKeyHelp.ts`). Ordered FR steps + the official key page + the key's
 * prefix (placeholder) + a one-line note on cost/hosting. Keyed by `ProviderId`; a
 * provider with no entry falls back to the minimal form + the registry `keyUrl` link.
 */
/** The FACTS about a provider's key — they aren't translated, so they live here.
 *  The steps and the note, though, are copy: catalogue (`providerKeys`). */
export interface ProviderKeyShape {
  /** The provider's OFFICIAL key page. */
  keyUrl: string;
  /** Input placeholder = the key's recognisable prefix. Absent when the key doesn't
   *  have one: the caller then puts « Votre clé <fournisseur> », which is translated. */
  placeholder?: string;
  /** The prefix a key of this provider PROVABLY starts with, when it has one — the
   *  paste-time verdict's only hard fact. Absent = the provider mints keys with no
   *  fixed shape, and no shape claim may be made about them. */
  prefix?: string;
}

export interface ProviderKeyHelp extends ProviderKeyShape {
  /** Ordered tutorial steps, in the interface language. Absent ⇒ the provider has a
   *  documented key SHAPE but no how-to: the screen then falls back to the minimal
   *  form + the official link, never an empty list. */
  steps?: readonly string[];
  /** One-line note (cost / billing / hosting) shown under the steps. */
  note?: string;
}

const PROVIDER_KEY_SHAPE: Partial<Record<ProviderId, ProviderKeyShape>> = {
  openai: {
    keyUrl: "https://platform.openai.com/api-keys",
    placeholder: "sk-…",
    prefix: "sk-",
  },
  anthropic: {
    keyUrl: "https://console.anthropic.com/settings/keys",
    placeholder: "sk-ant-…",
    prefix: "sk-ant-",
  },
  google: {
    keyUrl: "https://aistudio.google.com/app/apikey",
    placeholder: "AIza…",
    prefix: "AIza",
  },
  mistral: {
    keyUrl: "https://console.mistral.ai/api-keys",
  },
  deepseek: {
    keyUrl: "https://platform.deepseek.com/api_keys",
    placeholder: "sk-…",
    prefix: "sk-",
  },
  openrouter: {
    keyUrl: "https://openrouter.ai/keys",
    placeholder: "sk-or-…",
    prefix: "sk-or-",
  },
};

/** The key help for a provider id, or undefined if none is documented. */
export function providerKeyHelp(provider: string, t: Messages): ProviderKeyHelp | undefined {
  const shape = PROVIDER_KEY_SHAPE[provider as ProviderId];
  if (!shape) return undefined;
  // The namespace ALSO carries the verdict's two sentences: only an OBJECT value is
  // a sheet. Without it we return the shape alone, and the screen shrinks to the official link.
  const copy = t.providerKeys[provider as keyof Messages["providerKeys"]];
  return typeof copy === "object" ? { ...shape, ...copy } : shape;
}

/** A paste-time verdict on a pasted key. `error` = a shape the value provably cannot
 *  have; `warn` = merely suspicious. */
export interface ProviderKeyIssue {
  level: "error" | "warn";
  message: string;
}

/** Below this a key is almost certainly a truncated copy — every provider above mints
 *  far longer ones. A threshold, not a proof, hence `warn`. */
const SHORT_KEY = 20;

/**
 * What is visibly wrong with a key AS IT IS PASTED — the same service the MCP flow's
 * `byoValidate.ts` renders for a client id, on the one shape an LLM key has.
 *
 * ⚠️ It NEVER blocks the save, on purpose. The prefix is documentation, not a contract:
 * the day a provider mints a new shape, a blocking check would turn this screen into a
 * dead end for a key that actually works — while the wrong key merely fails, loudly and
 * with the provider's own words, at the first send. So this explains and lets the person
 * decide. (`ApiKeyModal` shows the same messages.)
 */
export function providerKeyIssue(
  provider: string,
  value: string,
  t: Messages,
): ProviderKeyIssue | undefined {
  const v = value.trim();
  if (!v) return undefined;
  const shape = PROVIDER_KEY_SHAPE[provider as ProviderId];
  const label = PROVIDERS[provider as ProviderId]?.label ?? provider;
  if (shape?.prefix && !v.startsWith(shape.prefix)) {
    return { level: "error", message: t.providerKeys.wrongPrefix(label, shape.prefix) };
  }
  if (v.length < SHORT_KEY) {
    return { level: "warn", message: t.providerKeys.tooShort };
  }
  return undefined;
}
