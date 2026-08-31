import { ShieldIcon, ArrowRightIcon } from "../../components/brand";
import { useHost, type OrgProfileInfo } from "../../host";
import { REDACT_CATEGORIES } from "../../privacy/redactCategories";
import { useT } from "../../i18n";


/** Category key → its display label (for the "règles imposées" list). */
const catLabel = (key: string): string =>
  REDACT_CATEGORIES.find((c) => c.key === key)?.label ?? key;

/**
 * The "Organisation" settings tab — reflects the signed-in member's organization,
 * reproducing the design-system chat-app `OrgSection`: an org card (name · plan ·
 * role badge), a three-stat row (members / role / imposed rules), an "ACCÈS" card
 * (the org-imposed redaction rules + an admin-console link for owners/admins), and
 * a shield note. Presentation only — enforcement lives in the store (`orgProfile`).
 * Rendered by `SettingsView` only when the account belongs to an organization.
 */
export function OrgSection({ org }: { org: OrgProfileInfo }) {
  const host = useHost();
  const t = useT();
  // Role and plan: server keys, named in the interface's language.
  const roles: Record<string, string> = {
    owner: t.orgTab.roleOwner,
    admin: t.orgTab.roleAdmin,
    member: t.orgTab.roleMember,
  };
  const plans: Record<string, string> = { FREE: t.orgTab.planFree, PRO: t.orgTab.planPro };
  const roleLabel = org.role ? (roles[org.role] ?? org.role) : t.orgTab.roleMember;
  const initial = (org.organizationName ?? "?").trim().charAt(0).toUpperCase() || "?";
  const planLine = [org.organizationSlug, org.plan && t.orgTab.plan(plans[org.plan] ?? org.plan)]
    .filter(Boolean)
    .join(" · ");
  const forced = org.forcedCategories;
  const isAdmin = org.role === "owner" || org.role === "admin";
  const canOpenAdmin = isAdmin && !!host.org?.openAdmin;

  return (
    <div className="org-tab">
      <section>
        <div className="cv-eyebrow">{t.orgTab.eyebrow}</div>
        <div className="settings-card pad org-card">
          <span className="org-avatar">{initial}</span>
          <div className="org-body">
            <div className="org-name">{org.organizationName ?? t.orgTab.yourOrg}</div>
            {planLine && <div className="org-sub">{planLine}</div>}
          </div>
          <span className="org-role-badge">{roleLabel}</span>
        </div>
      </section>

      <section>
        <div className="org-stats">
          {[
            [org.memberCount != null ? String(org.memberCount) : "—", t.orgTab.members],
            [roleLabel, t.orgTab.yourRole],
            [String(forced.length), t.orgTab.rules(forced.length)],
          ].map(([n, l]) => (
            <div key={l} className="settings-card pad org-stat">
              <span className="org-stat-n">{n}</span>
              <div className="org-stat-l">{l}</div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="cv-eyebrow">{t.orgTab.accessEyebrow}</div>
        <div className="settings-card org-access">
          <div className="org-access-row">
            <div className="row-body">
              <div className="row-title">{t.orgTab.forcedTitle}</div>
              <div className="row-desc">
                {forced.length
                  ? t.orgTab.forcedList(forced.map(catLabel).join(", "))
                  : t.orgTab.forcedNone}
              </div>
            </div>
            {forced.length > 0 && <span className="org-access-tag">{t.orgTab.active}</span>}
          </div>
          {canOpenAdmin && (
            <button className="org-access-row org-access-btn" onClick={() => host.org!.openAdmin!()}>
              <div className="row-body">
                <div className="row-title">{t.orgTab.adminConsole}</div>
                <div className="row-desc">{t.orgTab.adminConsoleHint}</div>
              </div>
              <ArrowRightIcon size={16} />
            </button>
          )}
        </div>
        {forced.length > 0 && (
          <div className="org-foot-note">
            <ShieldIcon size={13} /> {t.orgTab.minimalNote(org.organizationName ?? t.orgTab.yourOrg.toLowerCase())}
          </div>
        )}
      </section>
    </div>
  );
}
