import { useCallback, useState } from "react";

const KEY = "openmasq.rightRailExpanded";

function read(): boolean {
  try {
    return globalThis.localStorage?.getItem(KEY) === "1";
  } catch {
    return false; // storage blocked: start narrow, as before
  }
}

/**
 * The right rail's width, REMEMBERED across launches. The folders tree only exists in
 * the wide form, so a rail that always restarted narrow re-hid it behind a click
 * nobody is invited to make. A per-device UI preference, like the workspace layout
 * (`workspace/layout/persist.ts`) — not a setting, it doesn't follow the account.
 */
export function useRailExpanded(): [boolean, (next: boolean | ((v: boolean) => boolean)) => void] {
  const [expanded, setState] = useState(read);
  const set = useCallback((next: boolean | ((v: boolean) => boolean)) => {
    setState((prev) => {
      const v = typeof next === "function" ? next(prev) : next;
      try {
        globalThis.localStorage?.setItem(KEY, v ? "1" : "0");
      } catch {
        /* storage blocked: the width still changes for this session */
      }
      return v;
    });
  }, []);
  return [expanded, set];
}
