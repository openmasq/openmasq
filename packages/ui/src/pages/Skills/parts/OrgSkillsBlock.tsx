import type { Skill } from "../../../types";
import type { ItemScope } from "../../../orgShares/scopes";
import { scopes } from "../../../orgShares/scopes";
import { ScopeBadge } from "../../../components/brand/ScopeBadge";
import { SkillCard } from "./SkillCard";
import { useT } from "../../../i18n";

/** A mirror compétence carries the scope of the share it arrived by
 *  (device-local tag written by the org sync aggregation). */
export type SharedSkill = Skill & { orgScope?: "team" | "org" };

/**
 * The SHARED sections of the Compétences page (design source: ui_kits/chat-app
 * — the grid groups by scope, Organisation then Équipe, each headed by its
 * badge + note). Cards are USABLE by anyone, owned by their author: no pin
 * (a personal ordering gesture), no editor. Your own shared compétence also
 * appears here — beside your personal copy, badged; that is the design's
 * accumulation model, not a bug to dedupe.
 */
export function OrgSkillsBlock({
  competences: skills,
  onUse,
}: {
  /** The aggregated mirror (`Settings.orgCompetences`), scope-tagged. */
  competences: SharedSkill[];
  onUse: (c: Skill) => void;
}) {
  const t = useT();
  if (!skills.length) return null;
  return (
    <div className="om-org-sections">
      {scopes(t).filter((sc) => sc.id !== "personal").map((sc) => {
        const rows = skills.filter((c) => (c.orgScope ?? "org") === sc.id);
        if (!rows.length) return null;
        return (
          <section key={sc.id} className="om-org-section">
            <div className="om-org-section-head">
              <ScopeBadge scope={sc.id as ItemScope} size="md" />
              <span className="om-org-section-note">{sc.note}</span>
            </div>
            <div className="om-skill-grid">
              {rows.map((c) => (
                <SkillCard key={c.id} skill={c} onEdit={() => onUse(c)} onUse={() => onUse(c)} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
