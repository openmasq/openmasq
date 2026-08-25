import type { Competence } from "../../../types";
import type { ItemScope } from "../../../orgShares/scopes";
import { SCOPES } from "../../../orgShares/scopes";
import { ScopeBadge } from "../../../components/brand/ScopeBadge";
import { CompetenceCard } from "./CompetenceCard";

/** A mirror compétence carries the scope of the share it arrived by
 *  (device-local tag written by the org sync aggregation). */
export type SharedCompetence = Competence & { orgScope?: "team" | "org" };

/**
 * The SHARED sections of the Compétences page (design source: ui_kits/chat-app
 * — the grid groups by scope, Organisation then Équipe, each headed by its
 * badge + note). Cards are USABLE by anyone, owned by their author: no pin
 * (a personal ordering gesture), no editor. Your own shared compétence also
 * appears here — beside your personal copy, badged; that is the design's
 * accumulation model, not a bug to dedupe.
 */
export function OrgCompetencesBlock({
  competences,
  onUse,
}: {
  /** The aggregated mirror (`Settings.orgCompetences`), scope-tagged. */
  competences: SharedCompetence[];
  onUse: (c: Competence) => void;
}) {
  if (!competences.length) return null;
  return (
    <div className="om-org-sections">
      {SCOPES.filter((sc) => sc.id !== "personal").map((sc) => {
        const rows = competences.filter((c) => (c.orgScope ?? "org") === sc.id);
        if (!rows.length) return null;
        return (
          <section key={sc.id} className="om-org-section">
            <div className="om-org-section-head">
              <ScopeBadge scope={sc.id as ItemScope} size="md" />
              <span className="om-org-section-note">{sc.note}</span>
            </div>
            <div className="om-skill-grid">
              {rows.map((c) => (
                <CompetenceCard key={c.id} competence={c} onEdit={() => onUse(c)} onUse={() => onUse(c)} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
