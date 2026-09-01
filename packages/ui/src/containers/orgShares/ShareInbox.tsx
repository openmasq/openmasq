import { useState } from "react";
import { BellIcon, CheckIcon, ShieldIcon, SparklesIcon } from "../../components/brand";
import { ScopeBadge } from "../../components/brand/ScopeBadge";
import type { VaultTerm, Skill } from "../../types";
import type { OrgShareView } from "../../host/orgShares";
import { shareInboxVisible, useOrgShares } from "./useOrgShares";

import { useT } from "../../i18n";
const audienceScope = (s: OrgShareView): string =>
  s.audience.kind === "org" ? "org" : s.audience.kind === "team" ? "team" : "personal";

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
  inOrg = false,
  onAdopt,
}: {
  wide?: boolean;
  /** Does this account belong to an organization? Without it (and with no share already
   *  received), the bell will never announce anything — it isn't rendered
   *  (`shareInboxVisible`). */
  inOrg?: boolean;
  /** Land an accepted person-share's items in the PERSONAL lists. */
  onAdopt?: (items: { terms: VaultTerm[]; competences: Skill[] }) => void;
}) {
  const t = useT();
  const { available, api, shares, decide, revoke } = useOrgShares();
  const [open, setOpen] = useState(false);
  if (!shareInboxVisible({ available, inOrg, shareCount: shares.length })) return null;

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
      title={n ? t.orgShares.requestsCount(n) : t.orgShares.requests}
      aria-label={t.orgShares.requests}
      onClick={() => setOpen((v) => !v)}
    >
      {wide ? (
        <>
          <span className="rr-foot-ico" aria-hidden="true">
            <BellIcon size={17} />
          </span>
          <span className="rr-foot-lbl">{t.orgShares.requestsShort}</span>
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
          <div
            className="om-shinbox-pop om-step-in"
            role="dialog"
            aria-label={t.orgShares.requests}
          >
            <div className="om-shinbox-head">
              <div className="cv-eyebrow">{t.orgShares.requests}</div>
            </div>
            <div className="om-shinbox-list">
              {toDecide.length === 0 && <div className="om-shinbox-empty">{t.orgShares.empty}</div>}
              {toDecide.map((s) => (
                <div key={s.shareUuid} className="om-shinbox-row">
                  <div className="om-shinbox-meta">
                    <span
                      className="om-shinbox-kind"
                      title={s.scope === "coffre" ? t.orgShares.vaultTerm : t.orgShares.skill}
                    >
                      {s.scope === "coffre" ? <ShieldIcon size={11} /> : <SparklesIcon size={11} />}
                    </span>
                    <ScopeBadge scope={audienceScope(s)} />
                  </div>
                  <div className="om-shinbox-name">{s.label}</div>
                  <div className="om-shinbox-by">
                    {t.orgShares.proposedBy(s.authorName ?? t.orgShares.someMember)}
                  </div>
                  <div className="om-shinbox-actions">
                    <button
                      type="button"
                      className="btn-primary om-shinbox-act"
                      onClick={() => void accept(s)}
                    >
                      <CheckIcon size={13} /> {t.orgShares.accept}
                    </button>
                    <button
                      type="button"
                      className="btn-ghost om-shinbox-act"
                      onClick={() => void decide(s.shareUuid, false)}
                    >
                      {t.orgShares.refuse}
                    </button>
                  </div>
                </div>
              ))}
              {mine.length > 0 && (
                <>
                  <div className="om-shinbox-head om-shinbox-mine-head">
                    <div className="cv-eyebrow">{t.orgShares.myShares}</div>
                  </div>
                  {mine.map((s) => (
                    <div key={s.shareUuid} className="om-shinbox-row is-mine">
                      <div className="om-shinbox-meta">
                        <ScopeBadge scope={audienceScope(s)} />
                        <span className={`om-org-status is-${s.status}`}>
                          {t.orgShares.status[s.status]}
                        </span>
                      </div>
                      <div className="om-shinbox-name">{s.label}</div>
                      {s.status !== "revoked" && (
                        <button
                          type="button"
                          className="om-org-mine-revoke"
                          onClick={() => void revoke(s.shareUuid)}
                        >
                          {t.orgShares.revoke}
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
