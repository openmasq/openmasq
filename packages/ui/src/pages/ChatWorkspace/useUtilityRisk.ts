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
 * L'avertissement d'utilité du composeur, pelé de `Composer.tsx` (gelé) en hook —
 * la direction que la doc du dossier prescrit. Règles, rationale et tests :
 * `utilityRisk.ts`. Trois sources nourrissent le risque — le BROUILLON (les trois
 * couches de détection), les PIÈCES JOINTES (`attachmentCats`) et le prompt de la
 * COMPÉTENCE mise en scène (`competencePromptCats`) — parce que la donnée dont la
 * réponse dépend vit bien plus souvent dans un document ou une compétence que dans
 * le texte tapé.
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
  /** Le geste « Garder en clair » : brouillon → keep ; pièce jointe → `reveal`. */
  keepInClear: (risk: UtilityRisk) => void;
  /** Les valeurs du prompt de la compétence — le compteur « N à redact » les compte. */
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
    const r = utilityRisk(p.input, riskCats); // déjà tout révélé ⇒ rien à dire
    if (r && riskValues(r, riskCats).every((v) => p.keepSet.has(v))) return null;
    return r;
  }, [p.input, riskCats, p.keepSet]);
  useEffect(() => {
    if (!p.input) setDismissed(null); // un brouillon vidé ré-arme (nouvel envoi, nouveau contexte)
  }, [p.input]);
  const keepInClear = (r: UtilityRisk) => {
    const values = riskValues(r, riskCats);
    values.forEach((v) => !p.keepSet.has(v) && p.toggleKeep(v));
    if (p.onRevealChange)
      for (const plan of revealPlan(values, p.attachments)) p.onRevealChange(plan.cid, plan.reveal);
  };
  return { risk, dismissed, dismiss: setDismissed, keepInClear, competenceCats };
}
