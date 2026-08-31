/**
 * Verify that a passphrase opens the key envelopes ALREADY stored server-side.
 *
 * Without this check, entering a passphrase different from the other devices'
 * produces NO signal: every HTTP call succeeds, and the device lives in a
 * parallel crypto world — it pushes records the others will never read, and seals
 * (`dekFor`) every scope whose envelope comes from elsewhere. This is the divergence
 * observed on 14/08 on `@integrations`: the server-side cascade had wiped the
 * envelopes, the first device to re-mint won (first-writer), and the other one —
 * on a different passphrase all along, silently — ended up locked out.
 *
 * The verdict is INFORMATIVE, never blocking: a deliberately new passphrase (first
 * install, lost passphrase) is legitimate — the app sets it anyway and STATES the
 * consequence, instead of letting it be discovered weeks later.
 */
import { openConvKey } from "./crypto";
import type { RecordTransport } from "./types";

export type PassphraseVerdict =
  /** The passphrase opens at least one existing envelope — it's indeed the account's. */
  | "match"
  /** Envelopes exist and NONE of the ones probed opens — a different passphrase rules. */
  | "mismatch"
  /** No envelope server-side — first device, any passphrase is the right one. */
  | "no-envelopes"
  /** Server unreachable / not connected — we don't know, we don't block. */
  | "unreachable";

/** How many envelopes to probe at most: one alone is enough in theory, but an account
 *  already diverged carries envelopes from BOTH worlds — probing several avoids
 *  declaring "mismatch" on the single envelope from the other device. */
const PROBES = 3;

export async function verifyPassphrase(
  transport: RecordTransport,
  passphrase: string,
): Promise<PassphraseVerdict> {
  let convIds: string[];
  try {
    convIds = await transport.listConvKeys();
  } catch {
    return "unreachable";
  }
  if (!convIds.length) return "no-envelopes";
  let probed = 0;
  for (const convId of convIds.slice(0, PROBES * 2)) {
    let envelope;
    try {
      envelope = await transport.getConvKey(convId);
    } catch {
      continue; // intermittent network on ONE envelope → try the next one
    }
    if (!envelope) continue;
    probed++;
    try {
      await openConvKey(envelope, passphrase);
      return "match";
    } catch {
      /* not this one — continue */
    }
    if (probed >= PROBES) break;
  }
  return probed ? "mismatch" : "unreachable";
}
