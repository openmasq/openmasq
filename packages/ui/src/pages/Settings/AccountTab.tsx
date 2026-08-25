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
  // The signed-in account (email + sign-out). Absent in the browser preview
  // (no host.auth) → the account section is skipped.
  const { user, enabled: authEnabled, signOut } = useAuth();
  // Code interpreter is desktop-only (needs host.python) — the toggle is hidden elsewhere.
  const host = useHost();

  // Le thème avait deux axes ; il n'en reste qu'UN au choix — le FOND, clair ou sombre.
  // L'accent est l'indigo dans les deux cas : `blueAccent` (state/storePersistence) traduit
  // aussi les thèmes verts déjà persistés, donc ce commutateur ne peut plus produire de
  // valeur que cette fonction refuserait.
  const isDark = draft.theme === "dark" || draft.theme === "blue-dark";
  const themeFor = (dark: boolean): NonNullable<Settings["theme"]> => (dark ? "blue-dark" : "blue");
  const applyTheme = (theme: NonNullable<Settings["theme"]>) => {
    captureEvent({ name: "theme_toggle", theme });
    setDraft((d) => ({ ...d, theme }));
  };

  return (
    <>
      {authEnabled && user && (
        <section className="settings-section">
          <div className="cv-eyebrow">Compte</div>
          <div className="settings-card account-card">
            <span className="account-avatar">
              <UsersIcon size={20} />
            </span>
            <div className="account-info">
              <div className="account-email">{user.email ?? "Compte connecté"}</div>
              <div className="account-hint">Connecté à {BRAND.name} sur cet appareil.</div>
            </div>
            <button type="button" className="account-signout" onClick={() => void signOut()}>
              <LogOutIcon size={15} />
              Se déconnecter
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
              title="Voir l'organisation"
            >
              <span className="org-avatar">
                {(orgProfile.organizationName ?? "?").trim().charAt(0).toUpperCase() || "?"}
              </span>
              <div className="account-info">
                <div className="account-email">
                  {orgProfile.organizationName ?? "Votre organisation"}
                </div>
                <div className="account-hint">
                  {[
                    orgProfile.organizationSlug,
                    orgProfile.role === "owner"
                      ? "propriétaire"
                      : orgProfile.role === "admin"
                        ? "administrateur"
                        : "membre",
                    orgProfile.memberCount != null
                      ? `${orgProfile.memberCount} membre${orgProfile.memberCount > 1 ? "s" : ""}`
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
              title="Créer une organisation — dans l'app web"
            >
              <span className="org-avatar">
                <UsersIcon size={18} />
              </span>
              <div className="account-info">
                <div className="account-email">Créer une organisation</div>
                <div className="account-hint">
                  Partages d'équipe, règles imposées, facturation par siège — la création se
                  fait dans l'app web.
                </div>
              </div>
              <ExternalIcon size={16} />
            </button>
          )}
        </section>
      )}

      {onImportConversations && (
        <section className="settings-section">
          <div className="cv-eyebrow">Vos données</div>
          <div className="settings-card">
            <div className="toggle-row">
              <div className="row-body">
                <div className="row-title flex items-center gap-2">
                  Importer des conversations
                  <span className="font-mono text-[10px] uppercase tracking-[0.06em] rounded-[3px] px-1.5 py-0.5 bg-[var(--hl-violet)] text-[color:var(--ink-on-hl)]">
                    Bêta
                  </span>
                </div>
                <div className="row-desc">
                  Depuis un export ChatGPT ou Claude — traité sur votre appareil.
                </div>
              </div>
              <button type="button" className="btn-ghost shrink-0 inline-flex items-center gap-2" onClick={() => setImportOpen(true)}>
                <DownloadIcon size={15} /> Importer
              </button>
            </div>
          </div>
        </section>
      )}

      <section className="settings-section">
        <div className="cv-eyebrow">Facturation des messages</div>
        <div className="settings-card">
          <div className="toggle-row">
            <div className="row-body">
              <div className="row-title">Utiliser mon abonnement {BRAND.name}</div>
              <div className="row-desc">
                Désactivé, vos messages passent par vos propres comptes (OpenAI, Gemini…).
              </div>
            </div>
            <Switch
              checked={draft.billingMode === "subscription"}
              onChange={(v) => setDraft((d) => ({ ...d, billingMode: v ? "subscription" : "byo" }))}
            />
          </div>
        </div>
      </section>

      <section className="settings-section">
        <div className="cv-eyebrow">Apparence</div>
        <div className="settings-card">
          <div className="toggle-row">
            <div className="row-body">
              <div className="row-title">Mode sombre</div>
              <div className="row-desc">Passe l'application en couleurs sombres.</div>
            </div>
            <Switch checked={isDark} onChange={(v) => applyTheme(themeFor(v))} />
          </div>
        </div>
      </section>

      {/* Le créneau absent (aperçu web, mobile) ⇒ pas d'interrupteur : un réglage qui
          promet une bannière que la plateforme ne sait pas dessiner est un mensonge. */}
      {host.notify && (
        <section className="settings-section">
          <div className="cv-eyebrow">Notifications</div>
          <div className="settings-card">
            <div className="toggle-row">
              <div className="row-body">
                <div className="row-title">Prévenir quand une réponse arrive</div>
                <div className="row-desc">
                  Seulement si vous regardez ailleurs — autre fenêtre, ou autre conversation.
                  La bannière ne montre ni le message ni le titre du fil ; le clic y ramène.
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
        <div className="cv-eyebrow">Statistiques</div>
        <div className="settings-card">
          <div className="toggle-row">
            <div className="row-body">
              <div className="row-title">Statistiques d'usage anonymes</div>
              <div className="row-desc">Des compteurs d'usage — jamais vos messages.</div>
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
        <div className="cv-eyebrow">Développeur</div>
        <div className="settings-card">
          <div className="toggle-row">
            <div className="row-body">
              <div className="row-title">Aperçus de liens</div>
              <div className="row-desc">
                Une vignette sous les liens. Activer révèle votre adresse IP au site lié.
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
