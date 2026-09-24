import { useEffect, useRef, useState } from "react";
import { pseudonymize, redactionCategory, toneForKind } from "@openmasq/redact";
import { useChatSelector } from "../../../containers/providers/chatStore";
import { combinedVaultTerms, vaultTermsToForced } from "../../../send/vaultTerms";
import { forcedVaultPatch } from "../forcedFake";
import type { Attachment } from "../Composer";
import type { ChatViewProps, ForcedRedaction } from "./types";

type SetAttachments = (next: (prev: Attachment[]) => Attachment[]) => void;

/**
 * Every value the user FORCES redacted, and the three gestures that add or remove one:
 * the selection menu (conversation or message), a zone of a not-yet-sent DOCUMENT, and the
 * deletion of a document false positive. Manual redactions made BEFORE a conversation
 * exists are buffered here and ride the first send (`forcedRedactions`); afterwards the
 * store persists them on the conversation.
 */
export function useForcedRedactions(p: ChatViewProps, setAttachments: SetAttachments) {
  const { conversation, settings, onForceRedact, onReveal } = p;
  const mergeVaultInto = useChatSelector((s) => s.mergeVaultInto);
  const [pendingForced, setPendingForced] = useState<ForcedRedaction[]>([]);
  useEffect(() => {
    if (conversation) setPendingForced([]);
  }, [conversation?.id]);

  const handleForceRedact = (value: string, category: string) => {
    if (conversation) onForceRedact?.(value, category);
    else setPendingForced((prev) => [...prev.filter((f) => f.value !== value), { value, category }]);
  };

  // Forcing from a MESSAGE must also SHOW: a message paints its pills from the vault, which
  // only the send path would otherwise seed. Kept apart from `handleForceRedact` because the
  // DOCUMENT path mints its own fake against an EMPTY vault — seeding there could hand the
  // same value two different fakes (`packages/redact/src/model/CLAUDE.md`).
  const seedForcedFake = (value: string, token: string) => {
    if (!conversation) return;
    const { id, redactionVault, redactionMode } = conversation;
    void forcedVaultPatch(value, token, redactionVault, redactionMode)
      .then((patch) => patch && mergeVaultInto(id, patch.vault, patch.kinds))
      .catch(() => {
        /* fake generation failed — the forced redaction still keeps it off the wire */
      });
  };

  // A SELECTED zone of a staged document, redacted as a chosen type. Two effects so the value
  // is protected whichever send path runs: a believable fake in the attachment's
  // `replacements` (preview + drop-time reuse), AND a forced redaction (re-detecting send).
  const handleDocForceRedact = (cid: string, rawValue: string, token: string) => {
    const value = rawValue.trim();
    if (!value) return;
    handleForceRedact(value, token);
    void pseudonymize(value, { forced: [{ value, category: token }], vault: {}, numbers: false })
      .then(({ matches }) => {
        const m = matches.find((x) => x.value === value) ?? matches[0];
        if (!m?.placeholder) return;
        const kind = redactionCategory(m.category ?? token);
        const rep = { real: value, fake: m.placeholder, tone: toneForKind(kind), kind };
        setAttachments((prev) =>
          prev.map((a) => {
            if (a.cid !== cid) return a;
            // Replace any prior mapping of this value; longest-first is the paint order.
            const reps = (a.replacements ?? []).filter((r) => r.real !== value);
            reps.push(rep);
            reps.sort((x, y) => y.real.length - x.real.length);
            return { ...a, replacements: reps, reveal: (a.reveal ?? []).filter((v) => v !== value) };
          }),
        );
      })
      .catch(() => {
        /* fake generation failed — the forced redaction still protects it */
      });
  };

  // DELETE a document redaction (a false positive): drop it from the attachment, record the
  // reveal on the conversation, and remember it for the pre-conversation first send, where
  // there is nothing to persist onto yet.
  const docDeletedRef = useRef<Set<string>>(new Set());
  const handleDocDeleteRedaction = (cid: string, rawValue: string) => {
    const value = rawValue.trim();
    if (!value) return;
    setAttachments((prev) =>
      prev.map((a) =>
        a.cid !== cid
          ? a
          : {
              ...a,
              replacements: (a.replacements ?? []).filter((r) => r.real !== value),
              reveal: (a.reveal ?? []).filter((v) => v !== value),
            },
      ),
    );
    docDeletedRef.current.add(value);
    onReveal?.(value, "delete");
  };

  // Coffre ⊕ the conversation's persisted set ⊕ this send's buffered ones. A document that
  // contains one must NOT reuse its drop-time redaction (`reusableDocReplacements`).
  const forcedValues: ForcedRedaction[] = [
    ...vaultTermsToForced(combinedVaultTerms(settings)),
    ...(conversation?.forcedRedactions ?? pendingForced),
  ];

  return {
    pendingForced,
    clearPendingForced: () => setPendingForced([]),
    forcedValues,
    docDeletedRef,
    handleForceRedact,
    seedForcedFake,
    handleDocForceRedact,
    handleDocDeleteRedaction,
  };
}

export type ForcedRedactionsApi = ReturnType<typeof useForcedRedactions>;
