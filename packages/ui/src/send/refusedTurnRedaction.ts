import type { Host } from "../host";
import type { Conversation, Settings } from "../types";
import { makeRedactFn } from "./redactionEngine";
import { mintRedactionKey } from "./redactionKey";
import { deriveRedactedSpans } from "./sendAnalytics";

/**
 * The redaction a REFUSED send still owes the person.
 *
 * The user's bubble goes on screen before the gates (`sendOrchestrator`: no empty
 * thread while a token fetch waits), and its highlights are patched in by the
 * redaction pass — which a send refused at the gate (no key, no credits, suspended,
 * unreachable endpoint) never reached. So « Rédige un email de remerciement à
 * julien@… » sat in clear under « Clé requise », the one screen where the product
 * had promised the opposite. Nothing had LEFT the machine, but the person could not
 * see that the masking works before paying for anything — and that is the order the
 * product states: masking first, then whatever the model costs.
 *
 * This runs the SAME engine as the send (`makeRedactFn`: the local detector + the
 * rules, the conversation's vault, salt, key and pinned mode), patches the bubble
 * with its spans and persists the vault so « Réessayer » reuses the very same fakes.
 * Display and vault only — no wire is built, nothing is logged as a send, no
 * analytics « send » is counted. Any failure here is swallowed: the refusal is the
 * message that matters, and a bubble left as typed is the state it was in before.
 */
export async function redactRefusedTurn(p: {
  host: Host;
  settings: Settings;
  orgForced?: string[];
  /** The conversation as it stood when the send started (vault, seed, categories). */
  conv: Conversation;
  text: string;
  userMsgId: string;
  patchConversation: (id: string, patch: (c: Conversation) => Conversation) => void;
}): Promise<void> {
  if (!p.text.trim() || typeof globalThis.crypto?.getRandomValues !== "function") return;
  try {
    const vault = { ...(p.conv.redactionVault ?? {}) };
    const redactionSalt =
      p.conv.redactionSalt ?? ((globalThis.crypto.getRandomValues(new Uint32Array(1))[0] & 0x7fffffff) || 1);
    const redactionKey = p.conv.redactionKey ?? mintRedactionKey();
    const redactionMode: "fake" | "token" =
      p.conv.redactionMode ?? (p.settings.redactWireTokens ? "token" : "fake");
    const r = await makeRedactFn(p.host, p.settings, p.orgForced)(
      p.text,
      undefined,
      vault,
      p.conv.redactCategories,
      { salt: redactionSalt, key: redactionKey, mode: redactionMode },
    );
    // A detector that did not run leaves the turn UNMARKED (no `redactions`): the regex
    // tier alone vaulted it, and `send/replayable.ts` keeps an unmarked turn off the wire.
    if (r.modelError) return;
    const redactedSpans = deriveRedactedSpans(r.matches);
    p.patchConversation(p.conv.id, (c) => ({
      ...c,
      messages: c.messages.map((m) =>
        m.id === p.userMsgId
          ? { ...m, redactions: r.matches.length, redactedSpans: redactedSpans.length ? redactedSpans : undefined }
          : m,
      ),
      redactionVault: vault,
      redactionSalt,
      redactionKey,
      redactionMode,
      redactionKinds: { ...c.redactionKinds, ...Object.fromEntries(redactedSpans.map((s) => [s.value, s.kind])) },
      updatedAt: Date.now(),
    }));
  } catch {
    // See the header: display only, the refusal stands on its own.
  }
}
