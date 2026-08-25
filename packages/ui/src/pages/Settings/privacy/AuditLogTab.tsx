import { useMemo, useState } from "react";
import type { Conversation } from "../../../types";
import { AuditRedactionView } from "./AuditRedactionView";
import { EgressJournalCard } from "./EgressJournalCard";

/**
 * L'onglet **Journal** — les deux moitiés de la même promesse, derrière UN sélecteur :
 * ce qui a été redacted (« Redaction ») et les adresses réellement contactées
 * (« Réseau »).
 *
 * ⚠️ Elles étaient EMPILÉES, le réseau sous le redaction. Or la table de redaction se
 * charge par pages de 40 sur une sentinelle d'`IntersectionObserver` : atteindre le bas
 * en rallonge la liste, indéfiniment. Le journal réseau était donc, littéralement,
 * inaccessible — présent dans le DOM, hors d'atteinte au défilement. Une vue à la fois,
 * et chacune est à un clic.
 */
type View = "redaction" | "network";

export function AuditLogTab({
  conversations,
  onOpenMessage,
}: {
  conversations: Conversation[];
  onOpenMessage?: (convId: string, msgId?: string) => void;
}) {
  const [view, setView] = useState<View>("redaction");
  // Le compteur du segment « Redaction » : ce que la vue affichera, calculé ici pour
  // que l'étiquette ne mente pas avant même qu'on l'ouvre.
  const protectedTotal = useMemo(
    () => conversations.reduce((n, c) => n + Object.keys(c.redactionVault ?? {}).length, 0),
    [conversations],
  );

  return (
    <>
      <div className="settings-section">
        <div className="om-seg" role="tablist" aria-label="Journal">
          <button
            type="button"
            role="tab"
            aria-selected={view === "redaction"}
            className={`om-seg-btn${view === "redaction" ? " on" : ""}`}
            onClick={() => setView("redaction")}
          >
            Redaction
            <span className="om-seg-n">{protectedTotal}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "network"}
            className={`om-seg-btn${view === "network" ? " on" : ""}`}
            onClick={() => setView("network")}
          >
            Réseau
          </button>
        </div>
      </div>

      {view === "redaction" ? (
        <AuditRedactionView conversations={conversations} onOpenMessage={onOpenMessage} />
      ) : (
        <EgressJournalCard />
      )}
    </>
  );
}
