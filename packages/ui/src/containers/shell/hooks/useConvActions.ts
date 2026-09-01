import type { ChatStore } from "../../../state/store";
import { closeTab, openTab, showWelcomePane, track, useAppDispatch, type Section } from "../../../state/redux";
import { findModelAny } from "../../../prompt/models";
import { isChatRef, tabRefId } from "../../../workspace/layout";
import type { ConvTab } from "../../../pages/ChatWorkspace";

export type ConvActions = {
  newChat: () => void;
  selectConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
  changeModel: (conversationId: string, modelId: string) => void;
  stopPane: (convId: string | null) => void;
  /** A conversation id → its live tab metadata (title / logo / busy) for a pane's strip. */
  resolveTab: (id: string) => ConvTab | null;
};

/**
 * The conversation verbs, with their privacy-safe tracked event attached. Each one
 * dispatches the event then does the work — keeping the two together is what stops a new
 * call site from silently skipping analytics.
 *
 * `onEnterConversation` is the shell's hook into "the user just landed ON a conversation".
 * Desktop has nothing to do (the chat is always on screen beside the nav); the mobile
 * shell uses it to PUSH the chat screen over its list. Every entry point — the list, the
 * ⌘K palette, a library deep-link — goes through `selectConversation`, so they all land on
 * the conversation rather than on the list.
 */
export function useConvActions({
  chat,
  go,
  onEnterConversation,
}: {
  chat: ChatStore;
  go: (s: Section) => void;
  onEnterConversation?: () => void;
}): ConvActions {
  const dispatch = useAppDispatch();

  // « Nouvelle conversation » no longer CREATES anything: it shows the focused pane's
  // welcome screen, and the conversation is born on the FIRST SEND (`ChatPane.onSend`, the same
  // path as the cold welcome). Creating on click used to leave an empty « Nouvelle
  // conversation » in the list — persisted, synced — on every click
  // that went nowhere.
  const newChat = () => {
    dispatch(track({ name: "new_chat" }));
    dispatch(showWelcomePane());
    go("chats");
    onEnterConversation?.();
  };
  const selectConversation = (id: string) => {
    dispatch(track({ name: "select_conversation", id }));
    chat.setActiveId(id);
    dispatch(openTab(id));
    // Picking a conversation always returns to the chat view (deselects Bibliothèque /
    // Settings if one of those was open).
    go("chats");
    onEnterConversation?.();
  };
  const deleteConversation = (id: string) => {
    dispatch(track({ name: "delete_conversation", id }));
    dispatch(closeTab(id));
    chat.deleteConversation(id);
  };
  const changeModel = (conversationId: string, modelId: string) => {
    const m = findModelAny(modelId);
    dispatch(track({ name: "change_model", provider: m?.provider ?? "", model: modelId }));
    chat.setModel(conversationId, modelId);
  };
  // Track a Stop for a given pane's conversation (the `send_message` event itself is
  // emitted from the store's send pipeline, where chars + redaction count are known).
  const stopPane = (convId: string | null) => {
    dispatch(track({ name: "stop" }));
    if (convId) chat.stop(convId);
    else chat.stop();
  };
  // Read fresh each render so titles / spinners never go stale.
  const resolveTab = (id: string): ConvTab | null => {
    const c = isChatRef(id) ? chat.conversations.find((x) => x.id === tabRefId(id)) : undefined;
    if (!c) return null;
    const m = c.modelId ? findModelAny(c.modelId) : undefined;
    return {
      id: c.id,
      title: c.title || "Nouvelle conversation",
      provider: m?.provider,
      modelId: c.modelId,
      busy: c.messages.some((msg) => msg.pending),
    };
  };

  return { newChat, selectConversation, deleteConversation, changeModel, stopPane, resolveTab };
}
