import { useMemo } from "react";
import { disabledKindsOf, effectiveRedactCategories } from "../../../send/redactionOptions";
import { buildRedactLevelApi } from "../redactLevelApi";
import type { ChatViewProps } from "./types";

export type RedactPolicy = { disabledKinds: string[]; key: string };

/**
 * The redaction rules IN FORCE for this conversation, from the SAME source the send uses
 * (`send/redactionOptions.ts`): global defaults ⊕ the conversation's sparse override ⊕ the
 * org's mandated categories. The preview MUST obey them or « Règles de masquage » looks
 * inert on the `patterns` engine, where the regex layer is the only one. `key` changes with
 * the policy, which is what re-runs the detection on a rule toggle.
 */
export function useRedactPolicy(p: ChatViewProps) {
  const { settings, conversation, orgProfile, onChangeSettings, onChangeConversation } = p;
  const forcedCategories = orgProfile?.forcedCategories;
  const redactPolicy = useMemo<RedactPolicy>(() => {
    const disabledKinds = disabledKindsOf(
      effectiveRedactCategories(settings?.redactCategories, conversation?.redactCategories, forcedCategories),
    );
    return { disabledKinds, key: disabledKinds.slice().sort().join(",") };
  }, [settings?.redactCategories, conversation?.redactCategories, forcedCategories]);
  // The level, adjustable from the composer — construction + invariants: `redactLevelApi.ts`.
  const redactLevel = useMemo(
    () => buildRedactLevelApi({ settings, onChangeSettings, conversation, onChangeConversation, forcedCategories }),
    [settings, onChangeSettings, conversation, onChangeConversation, forcedCategories],
  );
  return { redactPolicy, redactLevel };
}
