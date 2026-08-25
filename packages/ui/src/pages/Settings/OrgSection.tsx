import { ShieldIcon, ArrowRightIcon } from "../../components/brand";
import { useHost, type OrgProfileInfo } from "../../host";
import { REDACT_CATEGORIES } from "../../privacy/redactCategories";

/** Human label + badge tone for an org role. */
const ROLE_META: Record<string, { label: string }> = {
  owner: { label: "Propriétaire" },
  admin: { label: "Administrateur" },
  member: { label: "Membre" },
};
const PLAN_LABEL: Record<string, string> = { FREE: "Gratuit", PRO: "Business" };

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
  const roleLabel = org.role ? (ROLE_META[org.role]?.label ?? org.role) : "Membre";
  const initial = (org.organizationName ?? "?").trim().charAt(0).toUpperCase() || "?";
  const planLine = [org.organizationSlug, org.plan && `plan ${PLAN_LABEL[org.plan] ?? org.plan}`]
    .filter(Boolean)
    .join(" · ");
  const forced = org.forcedCategories;
  const isAdmin = org.role === "owner" || org.role === "admin";
  const canOpenAdmin = isAdmin && !!host.org?.openAdmin;

  return (
    <div className="org-tab">
      <section>
        <div className="cv-eyebrow">Votre organisation</div>
        <div className="settings-card pad org-card">
          <span className="org-avatar">{initial}</span>
          <div className="org-body">
            <div className="org-name">{org.organizationName ?? "Votre organisation"}</div>
            {planLine && <div className="org-sub">{planLine}</div>}
          </div>
          <span className="org-role-badge">{roleLabel}</span>
        </div>
      </section>

      <section>
        <div className="org-stats">
          {[
            [org.memberCount != null ? String(org.memberCount) : "—", "membres"],
            [roleLabel, "votre rôle"],
            [String(forced.length), forced.length === 1 ? "règle imposée" : "règles imposées"],
          ].map(([n, l]) => (
            <div key={l} className="settings-card pad org-stat">
              <span className="org-stat-n">{n}</span>
              <div className="org-stat-l">{l}</div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="cv-eyebrow">Accès</div>
        <div className="settings-card org-access">
          <div className="org-access-row">
            <div className="row-body">
              <div className="row-title">Règles imposées par l'organisation</div>
              <div className="row-desc">
                {forced.length
                  ? `${forced.map(catLabel).join(", ")} — non désactivables`
                  : "Aucune règle imposée pour le moment"}
              </div>
            </div>
            {forced.length > 0 && <span className="org-access-tag">ACTIVES</span>}
          </div>
          {canOpenAdmin && (
            <button className="org-access-row org-access-btn" onClick={() => host.org!.openAdmin!()}>
              <div className="row-body">
                <div className="row-title">Console d'administration</div>
                <div className="row-desc">Gérer les membres, l'usage et la sécurité</div>
              </div>
              <ArrowRightIcon size={16} />
            </button>
          )}
        </div>
        {forced.length > 0 && (
          <div className="org-foot-note">
            <ShieldIcon size={13} /> Le redaction minimal est imposé par{" "}
            {org.organizationName ?? "votre organisation"} et ne peut être désactivé.
          </div>
        )}
      </section>
    </div>
  );
}
