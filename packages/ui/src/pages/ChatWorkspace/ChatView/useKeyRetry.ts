import { useEffect, useRef, useState } from "react";
import type { ProviderId } from "@openmasq/llm";
import type { ChatViewProps, Message } from "./types";

/**
 * The access routes a user bumps into: the inline « Renseigner la clé » CTA on a failed bubble: open the key modal for that
 * provider, and once the saved key is reflected in `keyConfigured`, regenerate the SPECIFIC
 * failed turn in place — a single re-send, never a duplicate.
 */
export function useKeyRetry(p: ChatViewProps) {
  const { keyConfigured, onRegenerate, onSetApiKey, onConnectOpenRouter, onOpenSettings } = p;
  const [keyModalOpen, setKeyModalOpen] = useState(false);
  const [keyTarget, setKeyTarget] = useState<{ provider: ProviderId; label: string } | null>(null);
  // The « Modèles gratuits » explainer, opened from the picker's badge; carries the provider so the « votre clé » card can name it.
  const [accessInfo, setAccessInfo] = useState<{ focus: "free" | "credits" | "key"; providerLabel?: string } | null>(null);
  const pendingRetryRef = useRef(false);
  const keyRetryMsgIdRef = useRef<string | null>(null);

  function handleErrorAction(assistantId: string, action: NonNullable<Message["errorAction"]>) {
    if (action.kind === "missing_key") {
      keyRetryMsgIdRef.current = assistantId;
      setKeyTarget({ provider: action.provider as ProviderId, label: action.label ?? action.provider });
      setKeyModalOpen(true);
    } else if (action.kind === "upgrade_plan") {
      onOpenSettings("billing");
    }
  }

  useEffect(() => {
    if (!pendingRetryRef.current) return;
    pendingRetryRef.current = false;
    const msgId = keyRetryMsgIdRef.current;
    keyRetryMsgIdRef.current = null;
    if (msgId && onRegenerate) onRegenerate(msgId);
  }, [keyConfigured]);

  async function saveKey(value: string) {
    if (!keyTarget || !onSetApiKey) return;
    await onSetApiKey(keyTarget.provider, value);
    setKeyModalOpen(false);
    setKeyTarget(null);
    pendingRetryRef.current = true;
  }

  // The OAuth road ends the same way as a pasted key: the platform refreshes
  // `keyConfigured` once the key is stored, and that change is what replays the turn.
  const connectKey = onConnectOpenRouter
    ? async () => {
        const ok = await onConnectOpenRouter();
        if (ok) {
          setKeyModalOpen(false);
          setKeyTarget(null);
          pendingRetryRef.current = true;
        }
        return ok;
      }
    : undefined;

  return {
    keyModalOpen,
    keyTarget,
    accessInfo,
    setAccessInfo,
    handleErrorAction,
    saveKey,
    connectKey,
    closeKeyModal: () => setKeyModalOpen(false),
  };
}

export type KeyRetryApi = ReturnType<typeof useKeyRetry>;
