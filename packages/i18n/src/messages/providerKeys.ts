/**
 * « Where to find your API key », by PROVIDER — the detailed tutorial of `ApiKeyModal` and
 * of the first launch's key step.
 *
 * ⚠️ What is NOT here, and must not enter: the official page's ADDRESS, the key's
 * PREFIX and its shape. Those are facts about the provider, not copy —
 * `ui/src/containers/modals/providerKeyHelp.ts` keeps them, and it is what decides the
 * verdict on paste. Translating a prefix would make no sense; moving it here would make it
 * a string a proofreading pass could « correct ».
 *
 * ⚠️ Rule 8: DeepSeek's `note` says where the messages travel. That is jurisdiction
 * information, not a sales argument — it translates as such.
 *
 * A SLICE of the contract (`../messages.ts`), which stays the only list of namespaces.
 */
export interface ProviderKeyCopy {
  /** The steps, in order. */
  steps: readonly string[];
  /** One line about cost, billing or hosting. */
  note: string;
}

export interface ProviderKeysMessages {
  openai: ProviderKeyCopy;
  anthropic: ProviderKeyCopy;
  google: ProviderKeyCopy;
  mistral: ProviderKeyCopy;
  deepseek: ProviderKeyCopy;
  openrouter: ProviderKeyCopy;
  /** The verdict on PASTE — documentation, never a block: a renamed prefix
   *  would turn a refusal into a dead end, and a bad key fails anyway
   *  bruyamment au premier envoi. */
  wrongPrefix: (provider: string, prefix: string) => string;
  tooShort: string;
}
