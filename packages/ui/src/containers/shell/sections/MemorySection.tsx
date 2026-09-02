import { MemoryView } from "../../../pages/Memory";
import type { ShellApi } from "../useShell";

/** The Mémoire graph. `requestedId` is the deep-link from a message caption. */
export function MemorySection({
  shell,
  onToggleSidebar,
}: {
  shell: ShellApi;
  onToggleSidebar?: () => void;
}) {
  const { chat, deep } = shell;
  return (
    <MemoryView
      memoryData={chat.memoryData}
      conversations={chat.conversations}
      loaded={chat.loaded}
      requestedId={deep.openMemCard}
      onSetProfile={chat.setMemoryProfile}
      onAdd={chat.addMemoryCard}
      onUpdate={chat.updateMemoryCard}
      onRemove={chat.removeMemoryCard}
      onRestore={chat.restoreMemoryCard}
      onMerge={chat.mergeMemoryCards}
      onToggleSidebar={onToggleSidebar}
    />
  );
}
