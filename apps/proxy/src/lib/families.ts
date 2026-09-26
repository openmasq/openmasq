// The wire families the proxy relays, each to its own upstream origin (`ProxyConfig[family]`).
// One list: the relay, the passthrough, the card, the request lines and the config check all
// read it, so a family added here is added everywhere or the compiler says where it is not.
export const FAMILIES = ["openai", "anthropic", "gemini", "mistral"] as const;
export type Family = (typeof FAMILIES)[number];

/** The path prefix that NAMES a family (`/mistral/v1/…`). It addresses us, not the vendor, so
 *  the relay strips it. `mistral` is reachable ONLY this way: its paths are OpenAI's, and at
 *  the root they already belong to OpenAI. */
export const FAMILY_PREFIX = new RegExp(`^/(${FAMILIES.join("|")})(?=/|$)`);
