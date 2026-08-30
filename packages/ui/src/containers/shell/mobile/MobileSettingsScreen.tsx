import { BRAND } from "@openmasq/branding";
import { useEffect, useState } from "react";
import { Avatar, ChevLeftIcon, ChevRightIcon, HelpIcon } from "../../../components/brand";
import type { Conversation, Settings } from "../../../types";
import type { OrgProfileInfo } from "../../../host";
import type { UnavailableReason } from "../../../send/modelAvailability";
import { useAuth } from "../../../state/useAuth";
import { useSettingsPrefetch } from "../../../state/settingsPrefetch";
import { settingsMeta, type SettingsTabId as TabId } from "../../../pages/Settings/settingsIndex";
import { useT } from "../../../i18n";
import { useVisibleSettingsTabs } from "../../../pages/Settings/settingsTabs";
import { useSettingsDraft } from "../../../pages/Settings/useSettingsDraft";
import { SettingsTabContent } from "../../../pages/Settings/SettingsTabContent";
import { accountDisplayName } from "../accountName";
import { groupSettingsTabs } from "./settingsScreenModel";

interface Props {
  settings: Settings;
  onChange: (settings: Settings) => void;
  conversations?: Conversation[];
  orgProfile?: OrgProfileInfo | null;
  onSetApiKey: (id: string, value: string) => void | Promise<void>;
  keyConfigured?: ReadonlySet<string>;
  unavailableModels?: ReadonlyMap<string, UnavailableReason>;
  onOpenMessage?: (convId: string, msgId?: string) => void;
  onImportConversations?: (convs: Conversation[]) => { added: number; skipped: number };
  requestedTab?: { id: string; n: number; connectorId?: string } | null;
  /** Open « Aide » — the in-app guide. */
  onOpenGuide?: () => void;
}

/**
 * The mobile Réglages (kit `chat-app-mobile` Settings): a display title, an account card,
 * then grouped rows that PUSH their tab as a full-screen sub-page with a back header.
 * The desktop's vertical icon rail assumes a label can sit beside its icon in one glance;
 * ten of those stacked on a phone is a wall.
 *
 * Everything below the arrangement is shared with the desktop — the capability-gated tab
 * set, the tab contents, the draft's two-way binding — so a setting cannot exist on one
 * platform and not the other.
 *
 * ⚠️ Deliberately NOT copied from the kit's mock: its inline redaction-rules toggles and
 * its bottom « Se déconnecter ». Both already have a home in the Compte tab, one tap
 * away; a second entry point for the same thing is how two surfaces start disagreeing.
 */
export function MobileSettingsScreen({
  settings,
  onChange,
  onOpenGuide,
  conversations = [],
  orgProfile,
  onSetApiKey,
  keyConfigured,
  unavailableModels,
  onOpenMessage,
  onImportConversations,
  requestedTab,
}: Props) {
  const auth = useAuth();
  const [draft, setDraft] = useSettingsDraft(settings, onChange);
  const [tab, setTab] = useState<TabId>("account");
  // Two-level nav: the root list, or ONE pushed tab.
  const [open, setOpen] = useState(false);
  useSettingsPrefetch();

  // A deep-link must ALSO push the detail — landing on the root list drops the request
  // on the floor, which is what the ⌘K palette and the credit CTA rely on.
  useEffect(() => {
    if (requestedTab) {
      setTab(requestedTab.id as TabId);
      setOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedTab?.n]);

  const t = useT();
  const meta = settingsMeta(t);
  const activeTab: TabId = meta[tab] ? tab : "account";
  const groups = groupSettingsTabs(useVisibleSettingsTabs(orgProfile), t);
  const email = auth.user?.email;
  const org = orgProfile?.organizationName;

  if (open) {
    return (
      <div className="mobile-screen mset mset-pushed">
        <header className="mset-detail-head">
          <button
            type="button"
            className="mset-back"
            aria-label="Retour aux réglages"
            onClick={() => setOpen(false)}
          >
            <ChevLeftIcon size={20} />
          </button>
          <h1 className="mset-detail-title">{meta[activeTab].title}</h1>
        </header>
        <div className="mset-detail-body">
          <SettingsTabContent
            tab={activeTab}
            draft={draft}
            setDraft={setDraft}
            onPickTab={setTab}
            conversations={conversations}
            orgProfile={orgProfile}
            onSetApiKey={onSetApiKey}
            keyConfigured={keyConfigured}
            unavailableModels={unavailableModels}
            onOpenMessage={onOpenMessage}
            onImportConversations={onImportConversations}
            requestedTab={requestedTab}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mobile-screen mset">
      <header className="mset-head">
        <h1 className="mset-title">Réglages</h1>
      </header>
      <div className="mset-body">
        <button
          type="button"
          className="mset-account"
          onClick={() => {
            setTab("account");
            setOpen(true);
          }}
        >
          <Avatar name={accountDisplayName(email)} size={44} muted />
          <span className="mset-account-text">
            <span className="mset-account-name">{email ?? "Vous"}</span>
            <span className="mset-account-sub">{org ? `${org} · Organisation` : "Espace privé"}</span>
          </span>
          <ChevRightIcon size={18} />
        </button>

        {/* « Aide » — le guide, atteignable sur mobile aussi : la barre du bas n'a pas
            de place, et une app qui ne s'explique nulle part n'a pas de recours. */}
        {onOpenGuide && (
          <section className="mset-group">
            <div className="cv-eyebrow mset-group-title">Aide</div>
            <div className="mset-list">
              <button type="button" className="mset-row" onClick={onOpenGuide}>
                <span className="mset-row-ico">
                  <HelpIcon size={17} />
                </span>
                <span className="mset-row-lab">Prendre en main {BRAND.name}</span>
                <ChevRightIcon size={17} />
              </button>
            </div>
          </section>
        )}

        {groups.map((g) => (
          <section key={g.title} className="mset-group">
            <div className="cv-eyebrow mset-group-title">{g.title}</div>
            <div className="mset-list">
              {/* `entry`, pas `t` : `t` est le catalogue de traduction dans ce composant. */}
              {g.items.map((entry, i) => (
                <button
                  key={entry.id}
                  type="button"
                  className={`mset-row${i ? " sep" : ""}`}
                  onClick={() => {
                    setTab(entry.id);
                    setOpen(true);
                  }}
                >
                  <span className="mset-row-ico">{entry.icon}</span>
                  <span className="mset-row-lab">{meta[entry.id].title}</span>
                  <ChevRightIcon size={17} />
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
