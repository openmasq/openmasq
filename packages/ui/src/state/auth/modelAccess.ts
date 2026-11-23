import { PROVIDERS } from "@openmasq/llm";

/**
 * How this install reaches an answering model — ONE decision for the onboarding gate,
 * the onboarding's `access` stamp and the launch-time `access_state` event (rule 9).
 *
 * `none` is a real dead end only where nothing is served: without a hosted service, no
 * model answers until a key, a subscription CLI or a local endpoint exists. Precedence
 * is the road the person will actually use: an agent wins over a key.
 */
export type ModelAccess = "agent" | "key" | "local" | "platform" | "none";

export interface ModelAccessInput {
  /** Does this build serve included models (`send/platformAccess.ts`)? */
  served: boolean;
  /** The subscription CLIs: only one switched ON *and* found on this machine opens a road
   *  (`null` = not probed yet, which opens nothing), unless its own status says it is
   *  signed OUT (`signedOut`; an unknown session never blocks): an installed CLI nobody is
   *  logged into answers nothing, and a person let through lands in a chat that cannot reply. */
  agents: ReadonlyArray<{ enabled: boolean; detected: boolean | null; signedOut?: boolean }>;
  /** Ids holding a key. Only a PROVIDER id counts: the store also holds keys that answer
   *  nothing (the redaction model's). */
  keyConfigured: ReadonlySet<string>;
  /** Did the self-hosted endpoint ANSWER its probe? Its address alone proves nothing: it
   *  defaults to the usual local port, set whether or not a server runs there. */
  localReachable?: boolean | null;
}

export function modelAccess(p: ModelAccessInput): ModelAccess {
  if (p.agents.some((a) => a.enabled && a.detected === true && !a.signedOut)) return "agent";
  if ([...p.keyConfigured].some((id) => Object.hasOwn(PROVIDERS, id))) return "key";
  if (p.localReachable === true) return "local";
  if (p.served) return "platform";
  return "none";
}
