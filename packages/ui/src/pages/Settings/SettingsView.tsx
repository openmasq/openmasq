import { useEffect, useState } from "react";
import { ChevDownIcon, ChevLeftIcon } from "../../components/brand";
import type { Conversation, Settings } from "../../types";
import { settingsMeta, type SettingsTabId as TabId } from "./settingsIndex";
import { useT } from "../../i18n";
import type { OrgProfileInfo } from "../../host";
import type { UnavailableReason } from "../../send/modelAvailability";
import { useSettingsPrefetch } from "../../state/settingsPrefetch";
import { PageHeader } from "../../containers/shell/PageHeader";
import { useVisibleSettingsTabs } from "./settingsTabs";
import { useSettingsDraft } from "./useSettingsDraft";
import { SettingsTabContent } from "./SettingsTabContent";

interface Props {
  settings: Settings;
  onChange: (settings: Settings) => void;
  onClose: () => void;
  /** For the "Your privacy" stats. */
  conversations?: Conversation[];
  /** The signed-in member's org authorization (null = solo user). */
  orgProfile?: OrgProfileInfo | null;
  /** Set an API key (encrypted via host.keys) — the Modèles tab's per-provider gear. */
  onSetApiKey: (id: string, value: string) => void | Promise<void>;
  onClearApiKey?: (id: string) => void | Promise<void>;
  /** OAuth PKCE « Connecter mon compte OpenRouter » (`state/connectOpenRouter.ts`).
   *  Absent sur une plateforme sans ce flux ⇒ le bouton n'est pas dessiné. */
  onConnectOpenRouter?: () => Promise<boolean>;
  /** Providers whose key is already stored — the Modèles tab's "clé enregistrée" chip. */
  keyConfigured?: ReadonlySet<string>;
  /** Model id → why it can't send. The Modèles tab greys those out. */
  unavailableModels?: ReadonlyMap<string, UnavailableReason>;
  /** Jump to a conversation + an optional specific message (from the audit tab). */
  onOpenMessage?: (convId: string, msgId?: string) => void;
  /** Merge conversations imported from another assistant's export (Compte, BETA). */
  onImportConversations?: (convs: Conversation[]) => { added: number; skipped: number };
  /** Deep-link a specific tab open (e.g. the credit "upgrade" CTA → "billing"). The
   *  `n` nonce re-applies the request even for the same tab; the user can then switch.
   *  `connectorId` (with `id: "mcp"`) additionally preselects a connector's modal —
   *  used by the chat's suggested-integration cards. */
  requestedTab?: { id: string; n: number; connectorId?: string } | null;
  /** Expand/collapse the primary sidebar (shell-owned). */
  onToggleSidebar?: () => void;
}

/**
 * Full-page settings, DESKTOP layout: a vertical icon rail beside one tab's content.
 * The phone gets its own screen (`containers/shell/mobile/MobileSettingsScreen`) — the
 * tab set, the tab contents and the draft binding are shared, the arrangement is not.
 */
export function SettingsView({
  settings,
  onChange,
  onClose,
  conversations = [],
  orgProfile,
  onSetApiKey,
  onClearApiKey,
  onConnectOpenRouter,
  keyConfigured,
  unavailableModels,
  onOpenMessage,
  onImportConversations,
  requestedTab,
  onToggleSidebar,
}: Props) {
  const [draft, setDraft] = useSettingsDraft(settings, onChange);
  const [tab, setTab] = useState<TabId>("account");

  // Warm every tab's remote data (subscription/credits, releases, notes) ONCE on arrival
  // — cached in Redux, so switching tabs is instant (no per-tab fetch delay).
  useSettingsPrefetch();

  // A deep-link request (e.g. the credit "Passer à un abonnement supérieur" CTA) opens that
  // tab. Keyed on the nonce so a repeat request to the same tab re-applies.
  useEffect(() => {
    if (requestedTab) setTab(requestedTab.id as TabId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedTab?.n]);

  // Resilient active tab: a caller can hand us an unexpected value (e.g. a click handler
  // that leaks its event through `openSettings`), so fall back to "account" rather than
  // index `META` with an unknown key.
  const t = useT();
  const meta = settingsMeta(t);
  const activeTab: TabId = meta[tab] ? tab : "account";
  const navItems = useVisibleSettingsTabs(orgProfile);
  const mainItems = navItems.filter((t) => t.group === "main");
  const advItems = navItems.filter((t) => t.group !== "main");
  const activeIsAdvanced = advItems.some((t) => t.id === activeTab);
  const [advManual, setAdvManual] = useState(false);
  const advOpen = advManual || activeIsAdvanced;
  const setAdvOpen = (fn: (o: boolean) => boolean) => setAdvManual(fn(advOpen));
  const railBtn = (t: (typeof navItems)[number]) => {
    const on = activeTab === t.id;
    return (
      <button
        key={t.id}
        onClick={() => setTab(t.id)}
        title={t.label}
        className={`settings-rail-btn ${on ? "active" : ""}`}
        aria-current={on ? "page" : undefined}
      >
        <span className="settings-rail-ico">{t.icon}</span>
        <span className="settings-rail-lab">
          <span className="om-sweep">{t.label}</span>
        </span>
      </button>
    );
  };

  return (
    <div className="settings-page">
      <nav className="settings-rail">
        <button
          className="settings-rail-back"
          onClick={onClose}
          aria-label={t.accountTab.backToChats}
          title={t.accountTab.backToChats}
        >
          <ChevLeftIcon size={18} />
        </button>
        <div className="settings-rail-items">
          {mainItems.map(railBtn)}
          {advItems.length > 0 && (
            <>
              {/* One toggle instead of seven equal entries. It opens by itself when the
                  active tab lives inside — a deep link must never land behind a fold. */}
              <button
                type="button"
                className={`settings-rail-btn settings-rail-more${advOpen ? " on" : ""}`}
                aria-expanded={advOpen}
                onClick={() => setAdvOpen((o) => !o)}
              >
                <span className="settings-rail-ico">
                  <ChevDownIcon size={18} />
                </span>
                <span className="settings-rail-lab">
                  <span className="om-sweep">{t.accountTab.advanced}</span>
                </span>
              </button>
              {advOpen && advItems.map(railBtn)}
            </>
          )}
        </div>
      </nav>

      <div className="settings-main">
        <PageHeader
          title={meta[activeTab].title}
          subtitle={meta[activeTab].sub}
          onToggleSidebar={onToggleSidebar}
        />
        <div className="settings-page-body">
          <SettingsTabContent
            tab={activeTab}
            draft={draft}
            setDraft={setDraft}
            onPickTab={setTab}
            conversations={conversations}
            orgProfile={orgProfile}
            onSetApiKey={onSetApiKey}
            onClearApiKey={onClearApiKey}
            onConnectOpenRouter={onConnectOpenRouter}
            keyConfigured={keyConfigured}
            unavailableModels={unavailableModels}
            onOpenMessage={onOpenMessage}
            onImportConversations={onImportConversations}
            requestedTab={requestedTab}
          />
        </div>
      </div>
    </div>
  );
}
