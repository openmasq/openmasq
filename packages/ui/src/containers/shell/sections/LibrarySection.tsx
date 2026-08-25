import { LibraryView } from "../../../pages/Library";
import type { ShellApi } from "../useShell";

/**
 * The bibliothèque. A clicked file opens in THE shared side panel, which the shell
 * renders around this — a split pane on desktop, a bottom sheet on a phone.
 */
export function LibrarySection({
  shell,
  onToggleSidebar,
}: {
  shell: ShellApi;
  onToggleSidebar?: () => void;
}) {
  const { chat, conv, reattach } = shell;
  return (
    <LibraryView
      conversations={chat.conversations}
      onOpenConversation={conv.selectConversation}
      onReattach={reattach}
      onToggleSidebar={onToggleSidebar}
    />
  );
}
