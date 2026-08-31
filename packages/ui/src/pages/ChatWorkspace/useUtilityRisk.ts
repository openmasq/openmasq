import { useEffect, useMemo, useState } from "react";
import {
  utilityRisk,
  riskValues,
  attachmentCats,
  revealPlan,
  type UtilityRisk,
  type UtilityRiskKind,
  type RevealableAttachment,
} from "./utilityRisk";
import { competencePromptCats, type Cat } from "./composerDetection";

/**
 * The composer's utility warning, peeled off `Composer.tsx` (frozen) into a hook —
 * the direction the folder's doc prescribes. Rules, rationale and tests:
 * `utilityRisk.ts`. Three sources feed the risk — the DRAFT (the three
 * detection layers), the ATTACHMENTS (`attachmentCats`) and the staged
 * COMPÉTENCE's prompt (`competencePromptCats`) — because the data the
 * reply depends on lives far more often in a document or a compétence than in
 * the typed text.
 */
export function useUtilityRisk(p: {
  input: string;
  forcedCats: Cat[];
  regexCats: Cat[];
  modelCats: Cat[];
  attachments: readonly RevealableAttachment[];
  competencePreview?: string;
  disabledKinds?: readonly string[];
  keepSet: ReadonlySet<string>;
  toggleKeep: (value: string) => void;
  onRevealChange?: (cid: string, reveal: string[]) => void;
}): {
  risk: UtilityRisk | null;
  dismissed: UtilityRiskKind | null;
  dismiss: (k: UtilityRiskKind) => void;
  /** The « Garder en clair » gesture: draft → keep; attachment → `reveal`. */
  keepInClear: (risk: UtilityRisk) => void;
  /** The values from the compétence's prompt — the « N à redact » counter counts them. */
  competenceCats: Cat[];
} {
  const [dismissed, setDismissed] = useState<UtilityRiskKind | null>(null);
  const competenceCats = useMemo<Cat[]>(
    () => competencePromptCats(p.competencePreview, p.disabledKinds),
    [p.competencePreview, p.disabledKinds],
  );
  const riskCats = useMemo<Cat[]>(
    () => [
      ...p.forcedCats, ...p.regexCats, ...p.modelCats,
      ...attachmentCats(p.attachments), ...competenceCats,
    ],
    [p.forcedCats, p.regexCats, p.modelCats, p.attachments, competenceCats],
  );
  const risk = useMemo(() => {
    if (!p.input.trim()) return null;
    const r = utilityRisk(p.input, riskCats); // already all revealed ⇒ nothing to say
    if (r && riskValues(r, riskCats).every((v) => p.keepSet.has(v))) return null;
    return r;
  }, [p.input, riskCats, p.keepSet]);
  useEffect(() => {
    if (!p.input) setDismissed(null); // an emptied draft re-arms (new send, new context)
  }, [p.input]);
  const keepInClear = (r: UtilityRisk) => {
    const values = riskValues(r, riskCats);
    values.forEach((v) => !p.keepSet.has(v) && p.toggleKeep(v));
    if (p.onRevealChange)
      for (const plan of revealPlan(values, p.attachments)) p.onRevealChange(plan.cid, plan.reveal);
  };
  return { risk, dismissed, dismiss: setDismissed, keepInClear, competenceCats };
}
