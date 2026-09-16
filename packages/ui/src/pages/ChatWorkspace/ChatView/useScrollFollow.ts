import { useEffect, useRef, useState } from "react";
import type { VirtualListHandle } from "../../../components/VirtualMessageList";
import type { ChatViewProps, Message } from "./types";

/**
 * Auto-follow and jump-to-message. The view stays pinned to the bottom while the reply
 * streams; a manual scroll UP detaches it (re-reading isn't yanked back down); a NEW turn
 * re-pins it. The follow is driven by a ResizeObserver on the growing content, so it snaps
 * AFTER the markdown reflow settles instead of jumping to a stale height per chunk.
 */
export function useScrollFollow(p: ChatViewProps, messages: Message[]) {
  const { conversation, scrollTarget, onScrolled } = p;
  const scrollRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const stickBottom = useRef(true);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      stickBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 72;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    const inner = innerRef.current;
    if (!el || !inner) return;
    const follow = () => {
      if (stickBottom.current) el.scrollTop = el.scrollHeight;
    };
    const ro = new ResizeObserver(follow);
    ro.observe(inner);
    return () => ro.disconnect();
    // Re-bind when the content wrapper mounts/unmounts (welcome ⇄ thread).
  }, [messages.length === 0]);

  const prevLen = useRef(messages.length);
  useEffect(() => {
    if (messages.length > prevLen.current) {
      stickBottom.current = true;
      requestAnimationFrame(() => {
        const el = scrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      });
    }
    prevLen.current = messages.length;
  }, [messages.length]);

  // Opening a conversation lands at the bottom; the jump-to-message below runs in a later rAF and wins.
  useEffect(() => {
    stickBottom.current = true;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [conversation?.id]);

  // Handled through the virtual list's imperative handle so it works when the row is windowed off-screen.
  const listApi = useRef<VirtualListHandle | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  useEffect(() => {
    if (!scrollTarget || !conversation || scrollTarget.convId !== conversation.id) return;
    if (!messages.some((m) => m.id === scrollTarget.msgId)) {
      onScrolled?.();
      return;
    }
    const raf = requestAnimationFrame(() => {
      listApi.current?.scrollToKey(scrollTarget.msgId);
      setHighlightId(scrollTarget.msgId);
      onScrolled?.();
    });
    return () => cancelAnimationFrame(raf);
  }, [scrollTarget?.nonce, conversation?.id]);
  useEffect(() => {
    if (!highlightId) return;
    const timer = setTimeout(() => setHighlightId(null), 1800);
    return () => clearTimeout(timer);
  }, [highlightId]);

  return { scrollRef, innerRef, listApi, highlightId };
}

export type ScrollFollowApi = ReturnType<typeof useScrollFollow>;
