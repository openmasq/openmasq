import { SettingsView } from "../../../pages/Settings";
import { useHost } from "../../../host";
import { makeConnectOpenRouter } from "../../../state/auth/connectOpenRouter";
import type { ShellApi } from "../useShell";

/**
 * Settings renders in the main content area, so the primary nav STAYS visible beside it —
 * the settings icon rail is a SECOND sidebar, matching the design kit, not a full-screen
 * takeover. DESKTOP only: the phone has its own screen
 * (`containers/shell/mobile/MobileSettingsScreen`).
 */
export function SettingsSection({
  shell,
  onToggleSidebar,
}: {
  shell: ShellApi;
  onToggleSidebar?: () => void;
}) {
  const { chat, go, deep } = shell;
  const host = useHost();
  return (
    <SettingsView
      settings={chat.settings}
      onChange={chat.setSettings}
      onClose={() => go("chats")}
      conversations={chat.conversations}
      orgProfile={chat.orgProfile}
      onSetApiKey={chat.setApiKey}
      onClearApiKey={chat.clearApiKey}
      onConnectOpenRouter={makeConnectOpenRouter(host, chat.refreshKeys)}
      keyConfigured={chat.keyConfigured}
      unavailableModels={chat.unavailableModels}
      onImportConversations={chat.importConversations}
      requestedTab={deep.settingsTab}
      onToggleSidebar={onToggleSidebar}
      onOpenMessage={(convId, msgId) => {
        if (msgId) chat.openConversationAt(convId, msgId);
        else chat.setActiveId(convId);
        go("chats");
      }}
    />
  );
}
