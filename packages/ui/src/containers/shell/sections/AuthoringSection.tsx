import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import { CompetencesView, OrgCompetencesBlock } from "../../../pages/Competences";
import { applySkillImport, type ImportChoice } from "../../../import/applyImport";
import { SharePromoteModal } from "../../orgShares/SharePromoteModal";
import { useHost } from "../../../host";
import type { Competence } from "../../../types";
import type { ShellApi } from "../useShell";

/**
 * La section COMPÉTENCES.
 *
 * Elle s'appelait « Authoring » et servait DEUX écrans jumeaux — Compétences et
 * Workflows — parce que la barre du bas n'avait qu'un créneau pour les deux. Les deux
 * listes n'en font plus qu'une : celle qui pilote des connecteurs est une compétence qui
 * porte des `servers`.
 *
 * Dans une ORGANISATION, les sections partagées (Organisation, Équipe) se composent
 * AU-DESSUS de la grille personnelle (design), chaque carte personnelle offre
 * « Partager », et la modale de promotion + la proposition vivent ici — le backend
 * re-vérifie chaque geste.
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
