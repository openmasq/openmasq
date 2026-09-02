import type { Dispatch, SetStateAction } from "react";
import type { Conversation, Settings } from "../../types";
import { useHost, type OrgProfileInfo } from "../../host";
import type { UnavailableReason } from "../../send/modelAvailability";
import type { SettingsTabId as TabId } from "./settingsIndex";
import { AccountTab } from "./AccountTab";
import { SyncSection } from "./SyncSection";
import { OrgSection } from "./OrgSection";
import { McpTab } from "./mcp/McpTab";
import { ModelsTab } from "./models";
import { toggleFavoriteModel } from "../../components/ModelSelector/simpleList";
import { effectiveDefaultModelId, factorySimpleIds } from "../../prompt/defaultModel";
import { BrowserTab } from "./BrowserTab";
import { UsageTab } from "./billing/UsageTab";
import { AuditLogTab } from "./privacy/AuditLogTab";
import { PrivacyTab } from "./privacy/PrivacyTab";
import { BillingTab } from "./billing/BillingTab";
import { VersionsTab } from "./updates/VersionsTab";

export interface SettingsTabContentProps {
  tab: TabId;
  draft: Settings;
  setDraft: Dispatch<SetStateAction<Settings>>;
  /** Switch tabs from inside a tab (Modèles → Paiement, Synchro → Paiement). */
  onPickTab: (tab: TabId) => void;
  conversations?: Conversation[];
  orgProfile?: OrgProfileInfo | null;
  onSetApiKey: (id: string, value: string) => void | Promise<void>;
  onClearApiKey?: (id: string) => void | Promise<void>;
  /** OAuth PKCE « Connecter mon compte OpenRouter » (`state/connectOpenRouter.ts`).
   *  Absent on a platform without this flow ⇒ the button is not drawn. */
  onConnectOpenRouter?: () => Promise<boolean>;
  keyConfigured?: ReadonlySet<string>;
  unavailableModels?: ReadonlyMap<string, UnavailableReason>;
  onOpenMessage?: (convId: string, msgId?: string) => void;
  onImportConversations?: (convs: Conversation[]) => { added: number; skipped: number };
  requestedTab?: { id: string; n: number; connectorId?: string } | null;
}

/**
 * ONE tab's content — the same components whichever layout mounted them (the desktop
 * pane, the mobile pushed sub-page). Extracted so the two presentations cannot drift
 * over which tab renders what, nor over which props a tab receives.
 *
 * ⚠️ Modèles is the one tab whose content is a GRID rather than prose, so it gets the
 * wide reading column (`.wide`, 1100px vs 760): at 760 the model cards collapse to
 * ellipsised stubs.
 */
export function SettingsTabContent({
  tab,
  draft,
  setDraft,
  onPickTab,
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
}: SettingsTabContentProps) {
  const host = useHost();
  return (
    <div className={`settings-page-inner${tab === "models" ? " wide" : ""}`}>
      {tab === "models" ? (
        <ModelsTab
          // The default the access path makes (a ready CLI), unless one was picked by hand.
          defaultModelId={effectiveDefaultModelId(draft.defaultModelId, unavailableModels, orgProfile?.allowedModelIds)}
          onPick={(id) => setDraft((d) => ({ ...d, defaultModelId: id }))}
          onSetApiKey={onSetApiKey}
          onClearApiKey={onClearApiKey}
          onConnectOpenRouter={onConnectOpenRouter}
          keyConfigured={keyConfigured}
          orgProfile={orgProfile}
          unavailableModels={unavailableModels}
          onOpenBilling={() => onPickTab("billing")}
          local={{
            url: draft.openaiCompatBaseUrl,
            onUrl: (url) => setDraft((d) => ({ ...d, openaiCompatBaseUrl: url })),
            ids: draft.openaiCompatModelIds,
            onIds: (ids) => setDraft((d) => ({ ...d, openaiCompatModelIds: ids })),
          }}
          claudeCliEnabled={draft.claudeCliEnabled}
          onClaudeCliEnabled={(on) => setDraft((d) => ({ ...d, claudeCliEnabled: on }))}
          codexCliEnabled={draft.codexCliEnabled}
          onCodexCliEnabled={(on) => setDraft((d) => ({ ...d, codexCliEnabled: on }))}
          antigravityCliEnabled={draft.antigravityCliEnabled}
          onAntigravityCliEnabled={(on) => setDraft((d) => ({ ...d, antigravityCliEnabled: on }))}
          favoriteModels={draft.favoriteModels}
          onToggleFavorite={(id) =>
            setDraft((d) => ({
              ...d,
              favoriteModels: toggleFavoriteModel(
                d.favoriteModels,
                id,
                factorySimpleIds(unavailableModels, orgProfile?.allowedModelIds),
              ),
            }))
          }
        />
      ) : tab === "mcp" ? (
        <McpTab
          allowedMcpIds={orgProfile?.allowedMcpIds}
          requestedConnector={
            requestedTab?.connectorId
              ? { id: requestedTab.connectorId, n: requestedTab.n }
              : undefined
          }
        />
      ) : tab === "browser" ? (
        <BrowserTab draft={draft} setDraft={setDraft} />
      ) : tab === "privacy" ? (
        <PrivacyTab
          draft={draft}
          setDraft={setDraft}
          conversations={conversations}
          forcedCategories={orgProfile?.forcedCategories}
          onOpenAudit={() => onPickTab("audit")}
        />
      ) : tab === "audit" ? (
        <AuditLogTab conversations={conversations} onOpenMessage={onOpenMessage} />
      ) : tab === "usage" ? (
        <UsageTab conversations={conversations} orgProfile={orgProfile} />
      ) : tab === "billing" ? (
        <BillingTab orgProfile={orgProfile} />
      ) : tab === "versions" ? (
        <VersionsTab />
      ) : tab === "sync" ? (
        host.sync ? <SyncSection sync={host.sync} onUpgrade={() => onPickTab("billing")} /> : null
      ) : tab === "org" ? (
        orgProfile ? <OrgSection org={orgProfile} /> : null
      ) : (
        <AccountTab
          draft={draft}
          setDraft={setDraft}
          conversations={conversations}
          orgProfile={orgProfile}
          onOpenOrg={orgProfile ? () => onPickTab("org") : undefined}
          onImportConversations={onImportConversations}
        />
      )}
    </div>
  );
}
