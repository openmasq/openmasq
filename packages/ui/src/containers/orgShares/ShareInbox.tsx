import { useState } from "react";
import { BellIcon, CheckIcon, ShieldIcon, SparklesIcon } from "../../components/brand";
import { ScopeBadge } from "../../components/brand/ScopeBadge";
import type { CoffreTerm, Competence } from "../../types";
import type { OrgShareView } from "../../host/orgShares";
import { useOrgShares } from "./useOrgShares";

const audienceScope = (s: OrgShareView): string =>
  s.audience.kind === "org" ? "org" : s.audience.kind === "team" ? "team" : "personal";

const statusLabel: Record<OrgShareView["status"], string> = {
  pending: "En attente",
  approved: "Partagé",
  refused: "Refusé",
  revoked: "Retiré",
};

/**
 * The share-requests BELL (design source: ui_kits/chat-app `ShareInbox`),
 * mounted in the right rail's footer: the count is the point of the icon — a
 * bell with no number says « something may have happened », which is a reason
 * to click rather than a reason not to. The popover lists what THIS account
 * must decide (Accepter / Refuser — the decision needs more than a title, so
 * each row says WHO proposed WHAT to WHOM), then this account's own shares
 * with their status and « Retirer ». Accepting a PERSON share ADOPTS its
 * items into the personal lists — « vous gardez votre copie » goes both ways.
 */
export function ShareInbox({
  wide,
  onAdopt,
}: {
  wide?: boolean;
  /** Land an accepted person-share's items in the PERSONAL lists. */
  onAdopt?: (items: { terms: CoffreTerm[]; competences: Competence[] }) => void;
}) {
  const { available, api, shares, decide, revoke } = useOrgShares();
  const [open, setOpen] = useState(false);
  if (!available) return null;

  const toDecide = shares.filter((s) => s.canDecide);
  const mine = shares.filter((s) => s.mine);
  const n = toDecide.length;

  const accept = async (s: OrgShareView) => {
    await decide(s.shareUuid, true);
    if (s.audience.kind === "user" && api && onAdopt) {
      const items = await api.pullShareItems(s.shareUuid);
      if (items.terms.length || items.competences.length) onAdopt(items);
    }
  };

  const trigger = (
    <button
      type="button"
      className={`${wide ? "rr-foot-row" : "rail-btn"} om-shinbox-btn${n ? " has-n" : ""}`}
      title={n ? `${n} demande${n > 1 ? "s" : ""} de partage` : "Demandes de partage"}
      aria-label="Demandes de partage"
      onClick={() => setOpen((v) => !v)}
    >
      {wide ? (
        <>
          <span className="rr-foot-ico" aria-hidden="true">
            <BellIcon size={17} />
          </span>
          <span className="rr-foot-lbl">Demandes</span>
        </>
      ) : (
        <BellIcon size={17} />
      )}
      {n > 0 && <span className="om-shinbox-count">{n}</span>}
    </button>
  );

  return (
    <div className="om-shinbox">
      {trigger}
      {open && (
        <>
          <div className="om-shinbox-scrim" onClick={() => setOpen(false)} />
          <div className="om-shinbox-pop om-step-in" role="dialog" aria-label="Demandes de partage">
            <div className="om-shinbox-head">
              <div className="cv-eyebrow">Demandes de partage</div>
            </div>
            <div className="om-shinbox-list">
              {toDecide.length === 0 && (
                <div className="om-shinbox-empty">
                  Rien à examiner. Les termes et compétences proposés par vos collègues
                  apparaîtront ici.
                </div>
              )}
              {toDecide.map((s) => (
                <div key={s.shareUuid} className="om-shinbox-row">
                  <div className="om-shinbox-meta">
                    <span
                      className="om-shinbox-kind"
                      title={s.scope === "coffre" ? "Terme du coffre" : "Compétence"}
                    >
                      {s.scope === "coffre" ? <ShieldIcon size={11} /> : <SparklesIcon size={11} />}
                    </span>
                    <ScopeBadge scope={audienceScope(s)} />
                  </div>
                  <div className="om-shinbox-name">{s.label}</div>
                  <div className="om-shinbox-by">Proposé par {s.authorName ?? "un membre"}</div>
                  <div className="om-shinbox-actions">
                    <button type="button" className="btn-primary om-shinbox-act" onClick={() => void accept(s)}>
                      <CheckIcon size={13} /> Accepter
                    </button>
                    <button
                      type="button"
                      className="btn-ghost om-shinbox-act"
                      onClick={() => void decide(s.shareUuid, false)}
                    >
                      Refuser
                    </button>
                  </div>
                </div>
              ))}
              {mine.length > 0 && (
                <>
                  <div className="om-shinbox-head om-shinbox-mine-head">
                    <div className="cv-eyebrow">Mes partages</div>
                  </div>
                  {mine.map((s) => (
                    <div key={s.shareUuid} className="om-shinbox-row is-mine">
                      <div className="om-shinbox-meta">
                        <ScopeBadge scope={audienceScope(s)} />
                        <span className={`om-org-status is-${s.status}`}>{statusLabel[s.status]}</span>
                      </div>
                      <div className="om-shinbox-name">{s.label}</div>
                      {s.status !== "revoked" && (
                        <button
                          type="button"
                          className="om-org-mine-revoke"
                          onClick={() => void revoke(s.shareUuid)}
                        >
                          Retirer
                        </button>
                      )}
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
