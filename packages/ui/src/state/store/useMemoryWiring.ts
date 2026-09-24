import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { CompletePayload, Host } from "../../host";
import type { Conversation, Settings } from "../../types";
import { completeRouting, resolveEffectivePlatform } from "../../send/routing";
import { pinMemoryNote } from "../memory/memoryExtractionRun";
import { useContextCompaction } from "../memory/useContextCompaction";
import { useMemoryExtraction } from "../memory/useMemoryExtraction";
import { setMemoryFresh, store as reduxStore } from "../redux";

/**
 * Out-of-band model calls (automatic memory extraction, context compaction). Both read
 * WIRE turns only — already-egressed fakes, zero new PII out — and the call must ROUTE
 * exactly like a normal send: `resolveEffectivePlatform`/`completeRouting` are the single
 * routing source (rule 9); a bare `host.complete` reaches no endpoint for a keyless model.
 */
export function useMemoryWiring({
  host,
  settings,
  setSettings,
  keyConfigured,
  conversations,
  activeId,
  patchConversation,
}: {
  host: Host;
  settings: Settings;
  setSettings: Dispatch<SetStateAction<Settings>>;
  keyConfigured: Set<string>;
  conversations: Conversation[];
  activeId: string | null;
  patchConversation: (id: string, patch: (c: Conversation) => Conversation) => void;
}) {
  const memoryComplete = useCallback(
    async (payload: CompletePayload): Promise<string> => {
      if (!host.complete) throw new Error("complete host unavailable");
      const platform = resolveEffectivePlatform(payload.provider, payload.model, settings.billingMode, keyConfigured);
      const token = platform
        ? ((host.auth?.getAccessToken ? await host.auth.getAccessToken().catch(() => null) : null) ?? undefined)
        : undefined;
      // Throws when a platform route lacks its URL/token → caught by the runner, which
      // leaves the watermark and retries later.
      const routing = completeRouting(payload.provider, payload.model, {
        billingMode: settings.billingMode,
        keyConfigured,
        inferenceUrl: host.inferenceUrl,
        token,
        openaiCompatBaseUrl: settings.openaiCompatBaseUrl,
      });
      return host.complete({ ...payload, ...routing });
    },
    [host, settings.billingMode, settings.openaiCompatBaseUrl, keyConfigured],
  );
  const complete = host.complete ? memoryComplete : undefined;

  useContextCompaction({ conversations, activeId, settings, complete, patchConversation });
  useMemoryExtraction({
    conversations,
    activeId,
    settings,
    complete,
    patchConversation,
    setMemory: (fn) => setSettings((s) => ({ ...s, memoire: fn(s.memoire ?? { cards: [] }) })),
    noteOnMessage: (convId, count, createdIds, failed, updatedIds) =>
      patchConversation(convId, (c) => pinMemoryNote(c, count, createdIds, failed, updatedIds)),
    // Anything added to memory raises the rail's « nouveau » dot (cleared on visit).
    onMemoryFresh: () => reduxStore.dispatch(setMemoryFresh(true)),
  });
}
