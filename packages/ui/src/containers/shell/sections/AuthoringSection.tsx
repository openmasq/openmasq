import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import { CompetencesView, OrgCompetencesBlock } from "../../../pages/Competences";
import { applySkillImport, type ImportChoice } from "../../../import/applyImport";
import { SharePromoteModal } from "../../orgShares/SharePromoteModal";
import { useHost } from "../../../host";
import type { Competence } from "../../../types";
import type { ShellApi } from "../useShell";

/**
 * The COMPÉTENCES section.
 *
 * It used to be called « Authoring » and served TWO twin screens — Compétences and
 * Workflows — because the bottom bar only had one slot for both. The two
 * lists are now just one: the one that drives connectors is a competence that
 * carries `servers`.
 *
 * In an ORGANIZATION, the shared sections (Organization, Team) compose
 * ABOVE the personal grid (design), each personal card offers
 * « Partager », and the promotion modal + the proposal live here — the backend
 * re-checks every action.
 */
export function AuthoringSection({
  shell,
  onToggleSidebar,
}: {
  shell: ShellApi;
  onToggleSidebar?: () => void;
}) {
  const { chat, deep, stageCompetence } = shell;
  const host = useHost();
  const [promo, setPromo] = useState<Competence | null>(null);
  const onImport = (items: ImportChoice[]) =>
    applySkillImport(items, {
      competenceNames: chat.competences.map((c) => c.name),
      addCompetence: chat.addCompetence,
    });
  return (
    <>
      <CompetencesView
        competences={chat.competences}
        loaded={chat.loaded}
        onAdd={chat.addCompetence}
        onUpdate={chat.updateCompetence}
        onRemove={chat.removeCompetence}
        onRestore={chat.restoreCompetence}
        onTogglePin={chat.toggleCompetencePin}
        onUse={stageCompetence}
        onImport={onImport}
        requestedId={deep.openComp}
        onToggleSidebar={onToggleSidebar}
        onShareCompetence={host.orgShares ? (c) => setPromo(c) : undefined}
        orgBlock={
          chat.orgProfile ? (
            <OrgCompetencesBlock
              competences={chat.settings.orgCompetences ?? []}
              onUse={stageCompetence}
            />
          ) : undefined
        }
      />
      <AnimatePresence>
        {promo && (
          <SharePromoteModal
            subject={{ kind: "skill", competence: promo }}
            onClose={() => setPromo(null)}
            onShare={async (audience) =>
              !!(await host.orgShares?.proposeCompetences({
                audience,
                label: promo.name || "Compétence",
                competences: [promo],
              }))
            }
          />
        )}
      </AnimatePresence>
    </>
  );
}
