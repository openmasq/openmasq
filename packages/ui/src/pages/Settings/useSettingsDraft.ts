import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { Settings } from "../../types";

/**
 * Settings is a LIVE page, not a modal, so the draft is bound BOTH ways:
 *  - draft → store on every edit (changes apply immediately), and
 *  - store → draft when `settings` changes UNDER us (account switch, the async DB
 *    hydrate, a cross-tab sync).
 *
 * Without the second binding an external change was invisible here AND got clobbered by
 * the stale draft on the next edit — the reason an onboarding choice could fail to show
 * up in "Compte". `pushedRef` breaks the echo: `onChange(draft)` makes `settings`
 * identity-equal to the object we just pushed, so the store→draft effect no-ops instead
 * of looping.
 *
 * Shared by both settings presentations — a second copy of this dance is a second place
 * to get the echo wrong.
 */
export function useSettingsDraft(
  settings: Settings,
  onChange: (s: Settings) => void,
): [Settings, Dispatch<SetStateAction<Settings>>] {
  const [draft, setDraft] = useState<Settings>(settings);
  const pushedRef = useRef(settings);
  useEffect(() => {
    if (draft === pushedRef.current) return;
    pushedRef.current = draft;
    onChange(draft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);
  useEffect(() => {
    if (settings === pushedRef.current) return;
    pushedRef.current = settings;
    setDraft(settings);
  }, [settings]);
  return [draft, setDraft];
}
