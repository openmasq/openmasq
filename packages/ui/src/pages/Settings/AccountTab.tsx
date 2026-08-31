import { useState, type Dispatch, type SetStateAction } from "react";
import { AnimatePresence } from "framer-motion";
import { Switch, UsersIcon, LogOutIcon, DownloadIcon, ChevRightIcon, ExternalIcon } from "../../components/brand";
import { isDevMode } from "../../state/redux";
import { captureEvent } from "../../analytics";
import { useAuth } from "../../state/useAuth";
import type { Conversation, Settings } from "../../types";
import { useHost, type OrgProfileInfo } from "../../host";
import { ImportModal } from "./import";
import { disabledKindsOf, effectiveRedactCategories } from "../../send/redactionOptions";
import { DEFAULT_MODEL_ID } from "../../prompt/models";
import { BRAND } from "@openmasq/branding";
import { AppearanceSection } from "./AppearanceSection";
import { useT } from "../../i18n";

/** The "Compte" tab — the app's real account/privacy/redaction settings. The
 *  default-model picker lives in the Modèles settings tab (`Settings/models/`). */
export function AccountTab({
  draft,
  setDraft,
  conversations,
  orgProfile,
  onOpenOrg,
  onImportConversations,
}: {
  draft: Settings;
  setDraft: Dispatch<SetStateAction<Settings>>;
  conversations: Conversation[];
  /** The signed-in member's org authorization (null = solo user). */
  orgProfile?: OrgProfileInfo | null;
  /** Open the « Organisation » tab (the org card's one gesture). */
  onOpenOrg?: () => void;
  /** Merge conversations parsed from another assistant's export (BETA — hides the
   *  « Vos données » import row when absent). */
  onImportConversations?: (convs: Conversation[]) => { added: number; skipped: number };
}) {
  const [importOpen, setImportOpen] = useState(false);
  const t = useT();
  // The signed-in account (email + sign-out). Absent in the browser preview
  // (no host.auth) → the account section is skipped.
  const { user, enabled: authEnabled, signOut } = useAuth();
  // Code interpreter is desktop-only (needs host.python) — the toggle is hidden elsewhere.
  const host = useHost();

  return (
    <>
      {authEnabled && user && (
        <section className="settings-section">
          <div className="cv-eyebrow">{t.accountTab.eyebrow}</div>
          <div className="settings-card account-card">
            <span className="account-avatar">
              <UsersIcon size={20} />
            </span>
            <div className="account-info">
              <div className="account-email">{user.email ?? t.accountTab.signedInFallback}</div>
              <div className="account-hint">{t.accountTab.signedInHint(BRAND.name)}</div>
            </div>
            <button type="button" className="account-signout" onClick={() => void signOut()}>
              <LogOutIcon size={15} />
              {t.accountTab.signOut}
            </button>
          </div>
          {/* The CURRENT organization, right under the identity it governs — the
              card is a TARGET (kit MCP-card rule): the whole row opens the
              Organisation tab, where the detail lives. Solo account ⇒ no row. */}
          {orgProfile && (
            <button
              type="button"
              className="settings-card account-card account-org"
              onClick={onOpenOrg}
              disabled={!onOpenOrg}
              title={t.accountTab.viewOrg}
            >
              <span className="org-avatar">
                {(orgProfile.organizationName ?? "?").trim().charAt(0).toUpperCase() || "?"}
              </span>
              <div className="account-info">
                <div className="account-email">
                  {orgProfile.organizationName ?? t.accountTab.yourOrg}
                </div>
                <div className="account-hint">
                  {[
                    orgProfile.organizationSlug,
                    orgProfile.role === "owner"
                      ? t.accountTab.roleOwner
                      : orgProfile.role === "admin"
                        ? t.accountTab.roleAdmin
                        : t.accountTab.roleMember,
                    orgProfile.memberCount != null
                      ? t.accountTab.members(orgProfile.memberCount)
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </div>
              {onOpenOrg && <ChevRightIcon size={16} />}
            </button>
          )}
          {/* Solo account: the SAME slot offers creating one — the console's
              AdminGate lands a no-org user straight on its create form, so the
              gesture is a redirect to the web app, said as such (external). */}
          {!orgProfile && host.org?.openAdmin && (
            <button
              type="button"
              className="settings-card account-card account-org"
              onClick={() => host.org!.openAdmin!()}
              title={t.accountTab.createOrgTip}
            >
              <span className="org-avatar">
                <UsersIcon size={18} />
              </span>
              <div className="account-info">
                <div className="account-email">{t.accountTab.createOrg}</div>
                <div className="account-hint">
                  {t.accountTab.createOrgHint}
                </div>
              </div>
              <ExternalIcon size={16} />
            </button>
          )}
        </section>
      )}

      {onImportConversations && (
        <section className="settings-section">
          <div className="cv-eyebrow">{t.accountTab.dataEyebrow}</div>
          <div className="settings-card">
            <div className="toggle-row">
              <div className="row-body">
                <div className="row-title flex items-center gap-2">
                  {t.accountTab.importTitle}
                  <span className="font-mono text-[10px] uppercase tracking-[0.06em] rounded-[3px] px-1.5 py-0.5 bg-[var(--hl-violet)] text-[color:var(--ink-on-hl)]">
                    {t.accountTab.beta}
                  </span>
                </div>
                <div className="row-desc">
                  {t.accountTab.importHint}
                </div>
              </div>
              <button type="button" className="btn-ghost shrink-0 inline-flex items-center gap-2" onClick={() => setImportOpen(true)}>
                <DownloadIcon size={15} /> {t.accountTab.importCta}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* `host.billing` only exists in a build that SELLS subscriptions
          (`OPENMASQ_BILLING=1` — off by default): without it there is NO subscription to
          use, and the switch would only offer a redirect to a sale that
          doesn't exist. Absent, then — included models are served on the account, and your
          own keys take precedence as soon as they exist (`send/routing.ts`). */}
      {host.billing && (
        <section className="settings-section">
          <div className="cv-eyebrow">{t.accountTab.billingEyebrow}</div>
          <div className="settings-card">
            <div className="toggle-row">
              <div className="row-body">
                <div className="row-title">{t.accountTab.subscriptionToggle(BRAND.name)}</div>
                <div className="row-desc">
                  {t.accountTab.subscriptionToggleHint}
                </div>
              </div>
              <Switch
                checked={draft.billingMode === "subscription"}
                onChange={(v) => setDraft((d) => ({ ...d, billingMode: v ? "subscription" : "byo" }))}
              />
            </div>
          </div>
        </section>
      )}

      <AppearanceSection draft={draft} setDraft={setDraft} />

      {/* The slot absent (web preview, mobile) ⇒ no switch: a setting that
          promises a banner the platform can't draw is a lie. */}
      {host.notify && (
        <section className="settings-section">
          <div className="cv-eyebrow">{t.accountTab.notifEyebrow}</div>
          <div className="settings-card">
            <div className="toggle-row">
              <div className="row-body">
                <div className="row-title">{t.accountTab.notifTitle}</div>
                <div className="row-desc">
                  {t.accountTab.notifHint}
                </div>
              </div>
              <Switch
                checked={draft.notifyOnReply !== false}
                onChange={(v) => setDraft((d) => ({ ...d, notifyOnReply: v }))}
              />
            </div>
          </div>
        </section>
      )}

      <section className="settings-section">
        <div className="cv-eyebrow">{t.accountTab.statsEyebrow}</div>
        <div className="settings-card">
          <div className="toggle-row">
            <div className="row-body">
              <div className="row-title">{t.accountTab.statsTitle}</div>
              <div className="row-desc">{t.accountTab.statsHint}</div>
            </div>
            <Switch
              checked={draft.analyticsConsent ?? !isDevMode}
              onChange={(v) => {
                // Emit BEFORE the toggle takes effect: an opt-OUT must still send
                // (its own consent gate is checked at send time on the next event).
                captureEvent({ name: "analytics_consent", on: v });
                setDraft((d) => ({ ...d, analyticsConsent: v }));
              }}
            />
          </div>
        </div>
      </section>

      <section className="settings-section">
        <div className="cv-eyebrow">{t.accountTab.devEyebrow}</div>
        <div className="settings-card">
          <div className="toggle-row">
            <div className="row-body">
              <div className="row-title">{t.accountTab.linkPreviews}</div>
              <div className="row-desc">
                {t.accountTab.linkPreviewsHint}
              </div>
            </div>
            <Switch
              checked={!!draft.linkPreviews}
              onChange={(v) => setDraft((d) => ({ ...d, linkPreviews: v }))}
            />
          </div>
        </div>
      </section>

      <AnimatePresence>
        {importOpen && onImportConversations && (
          <ImportModal
            defaultModelId={draft.defaultModelId || DEFAULT_MODEL_ID}
            // Import-time redaction honours the SAME category set as a send: the
            // user's global toggles merged with the org-mandated ones.
            disabledKinds={disabledKindsOf(
              effectiveRedactCategories(draft.redactCategories, undefined, orgProfile?.forcedCategories),
            )}
            wireTokens={draft.redactWireTokens}
            onImport={onImportConversations}
            onClose={() => setImportOpen(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
