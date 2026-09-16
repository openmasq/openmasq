import { useEffect, useState } from "react";
import type { WriteConfirmInfo } from "../../../agent/mcpAgent";
import { confirmationsShownCount, recordConfirmationShown, webSearchCount } from "../../../agent/confirmationFacts";
import { isSendTool } from "../../../agent/mcpAgentClassify";
import { useHost } from "../../../host";
import type { RedactCategoryKey } from "../../../types";
import {
  applyWriteAllowLists,
  conversationAllowedWriteTools,
  convWriteToolKey,
  getConfirmationModeMirror,
  isWriteAutoApproveAll,
  pendingGateToRelease,
  sessionAllowedWriteTools,
  setConfirmationModeMirror,
  writeConfirmDecision,
  writeToolKey,
} from "../writeConfirm";
import type { ChatViewProps } from "./types";

type PendingWrite = { info: WriteConfirmInfo; resolve: (ok: boolean) => void };
type PendingWebNav = { categories: RedactCategoryKey[]; resolve: (r: RedactCategoryKey[]) => void };

/**
 * The two cards the agent loop parks on: the write confirmation and the pre-search reveal
 * gate. Both are keyed BY CONVERSATION, because turns run concurrently per tab — a single
 * slot let the second overwrite the first and strand its loop on a promise nobody could
 * resolve. The view may only render or decide the card whose conversation is on screen.
 * Promises are settled OUTSIDE the state updater: React may re-run an updater.
 */
export function usePendingGates(p: ChatViewProps, activeStreaming: boolean) {
  const { conversation } = p;
  const host = useHost();
  const [pendingWrites, setPendingWrites] = useState<Record<string, PendingWrite>>({});
  const [pendingWebNavs, setPendingWebNavs] = useState<Record<string, PendingWebNav>>({});
  const pendingWrite = conversation ? (pendingWrites[conversation.id] ?? null) : null;
  const pendingWebNav = conversation ? (pendingWebNavs[conversation.id] ?? null) : null;

  const releasePendingWrite = (convId: string, approved: boolean) => {
    const pending = pendingWrites[convId];
    if (!pending) return;
    pending.resolve(approved);
    setPendingWrites(({ [convId]: _dropped, ...rest }) => rest);
  };
  const releasePendingWebNav = (convId: string, reveal: RedactCategoryKey[]) => {
    const pending = pendingWebNavs[convId];
    if (!pending) return;
    pending.resolve(reveal);
    setPendingWebNavs(({ [convId]: _dropped, ...rest }) => rest);
  };

  // Stop pressed while a card is open: the loop aborts its await, so the card would linger
  // with a dangling promise. `pendingGateToRelease` owns the rule; fail-closed defaults.
  useEffect(() => {
    const release = pendingGateToRelease({
      pendingConvIds: Object.keys(pendingWrites),
      viewedConvId: conversation?.id,
      viewedIsStreaming: activeStreaming,
    });
    if (release) releasePendingWrite(release, false);
  }, [activeStreaming, conversation?.id, pendingWrites]);
  useEffect(() => {
    const release = pendingGateToRelease({
      pendingConvIds: Object.keys(pendingWebNavs),
      viewedConvId: conversation?.id,
      viewedIsStreaming: activeStreaming,
    });
    if (release) releasePendingWebNav(release, []);
  }, [activeStreaming, conversation?.id, pendingWebNavs]);

  // MAIN owns the persisted confirmation mode; the renderer only mirrors it. No host slot
  // (browser preview) ⇒ "standard", whose rules never defer to a window.
  useEffect(() => {
    host.mcp?.getConfirmationMode?.().then(setConfirmationModeMirror).catch(() => {});
  }, [host]);

  // WHEN a confirmation appears and on WHICH surface is `CONFIRMATION_POLICY`, evaluated
  // with this conversation's facts. POLICY FIRST: an allow-list exempts only a NON-floor
  // verdict. `convId` is the turn's OWN conversation, not the one on screen.
  const confirmToolWrite = (info: WriteConfirmInfo, convId: string) => {
    const allowedByUser =
      isWriteAutoApproveAll() ||
      sessionAllowedWriteTools.has(writeToolKey(info.server, info.tool)) ||
      conversationAllowedWriteTools.has(convWriteToolKey(convId, info.server, info.tool));
    const verdict = writeConfirmDecision({
      mode: getConfirmationModeMirror(),
      tool: info.tool,
      server: info.server,
      exfilFlags: info.flags.length,
      attachments: info.attachments?.length ?? 0,
      searchToolCalls: webSearchCount(convId),
      sends: isSendTool(info.tool),
      confirmationsShown: confirmationsShownCount(convId),
      mainWriteGate: !!host.mcp?.mainWriteGate,
    });
    const decision = applyWriteAllowLists(verdict, allowedByUser);
    // "defer-to-main": main's un-spoofable window is the single confirmation. "auto": nothing required.
    if (decision !== "card") return Promise.resolve(true);
    recordConfirmationShown(convId);
    return new Promise<boolean>((resolve) => setPendingWrites((m) => ({ ...m, [convId]: { info, resolve } })));
  };
  const reviewWebNav = (categories: RedactCategoryKey[], convId: string) =>
    new Promise<RedactCategoryKey[]>((resolve) =>
      setPendingWebNavs((m) => ({ ...m, [convId]: { categories, resolve } })),
    );

  // « Autoriser » holds for this tool in THIS conversation; the checkbox widens it to the session.
  const onWriteDecision = (approved: boolean, remember: boolean) => {
    if (!pendingWrite || !conversation) return;
    if (approved) {
      const { server, tool } = pendingWrite.info;
      conversationAllowedWriteTools.add(convWriteToolKey(conversation.id, server, tool));
      if (remember) sessionAllowedWriteTools.add(writeToolKey(server, tool));
    }
    releasePendingWrite(conversation.id, approved);
  };
  const onWebNavDecision = (reveal: RedactCategoryKey[]) => {
    if (conversation) releasePendingWebNav(conversation.id, reveal);
  };

  return { pendingWrite, pendingWebNav, confirmToolWrite, reviewWebNav, onWriteDecision, onWebNavDecision };
}

export type PendingGatesApi = ReturnType<typeof usePendingGates>;
