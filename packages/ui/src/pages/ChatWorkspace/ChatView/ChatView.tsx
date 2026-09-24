import { ChatHeader } from "../ChatHeader";
import { DropZone } from "../DropZone";
import { WelcomeScreen } from "../WelcomeScreen";
import { AccessModals, ChatOverlays } from "./parts/ChatOverlays";
import { ComposerBlock } from "./parts/ComposerBlock";
import { MessageThread } from "./parts/MessageThread";
import type { ChatViewProps } from "./types";
import { useChatViewModel } from "./useChatViewModel";

/** The chat screen: a props hub whose orchestration lives in the hooks of this folder. */
export function ChatView(props: ChatViewProps) {
  const m = useChatViewModel(props);
  const { p, view, scroll, sel, intake, send } = m;
  const { conversation, settings, onChangeSettings } = p;
  const composer = <ComposerBlock m={m} />;
  return (
    <DropZone onFiles={intake.addDroppedFiles}>
      <main className="chat">
        {/* The top bar is in-flow and doubles as the frameless-window drag region. */}
        <ChatHeader
          conversation={conversation}
          protectedCount={view.protectedCount}
          redactLevel={m.redactLevel}
          modelName={view.currentModelLabel}
          onOpenTransparency={() => view.setShowComparison(true)}
          settings={settings}
          onChangeSettings={onChangeSettings}
          onChangeConversation={p.onChangeConversation}
          onSetMemoryOff={p.onSetMemoryOff}
          onOpenSettings={p.onOpenSettings}
          onToggleSidebar={p.onToggleSidebar}
          onBack={p.onBack}
          onDelete={p.onDelete}
          showTabs={p.showTabs ?? true}
          tabs={p.tabs ?? []}
          activeId={p.activeId ?? null}
          onSelectTab={p.onSelectTab ?? (() => {})}
          onCloseTab={p.onCloseTab ?? (() => {})}
          onNewTab={p.onNew}
          onTabPointerDown={p.onTabPointerDown}
          onSplitTab={p.onSplitTab}
        />
        <div className="messages" ref={scroll.scrollRef} onMouseUp={sel.onMessagesMouseUp}>
          {view.messages.length === 0 ? (
            <WelcomeScreen
              greeting={view.greeting}
              composer={composer}
              startersOff={!!settings?.startersOff}
              onPick={(prompt) => void send.runSend(prompt, [])}
              onSeeAll={() => p.onOpenSettings("mcp")}
              onSetStartersOff={
                settings && onChangeSettings ? (off) => onChangeSettings({ ...settings, startersOff: off }) : undefined
              }
            />
          ) : (
            <MessageThread m={m} />
          )}
        </div>
        <ChatOverlays m={m} />
        {/* Docked at the bottom once a thread exists; on the empty home it sits in the welcome. */}
        {view.messages.length > 0 && composer}
        <AccessModals m={m} />
      </main>
    </DropZone>
  );
}
