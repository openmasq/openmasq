import type { MutableRefObject, ReactNode, RefObject } from "react";

/** Imperative handle: scroll a message into view by its key, even when the row
 *  is currently virtualized off-screen. Returns false if the key is unknown. */
export interface VirtualListHandle {
  scrollToKey: (key: string) => boolean;
}

export interface Props<T> {
  items: T[];
  /** The scroll container (the `.messages` element). */
  scrollRef: RefObject<HTMLDivElement | null>;
  getKey: (item: T) => string;
  children: (item: T, index: number) => ReactNode;
  /** Optional handle the parent can call to scroll to a message by key. */
  apiRef?: MutableRefObject<VirtualListHandle | null>;
  /** At/under this many items — AND under `charBudget` total — render everything
   *  (unchanged). Default 40 (chat). */
  threshold?: number;
  /** Rough render cost of an item, in characters. Supplying it is what lets a SHORT
   *  but very heavy thread window instead of mounting whole; it also sharpens the
   *  height estimate for a not-yet-measured row. Omit → count-only gating. */
  sizeOf?: (item: T) => number;
  /** Total `sizeOf` above which the list windows whatever the item count. Default 20k. */
  charBudget?: number;
  /** Assumed px for a not-yet-measured row. Default 220 (a chat bubble); pass a
   *  smaller value for shorter rows (e.g. debug-log entries) so the initial spacer
   *  estimate is closer before the real heights are measured. */
  estimate?: number;
  /** Where the list first renders its window. "bottom" mounts the LAST rows AND scrolls
   *  there before the first windowing pass — for a thread opened at its latest message,
   *  so a large conversation doesn't first render (then discard) the top rows. Default
   *  "top" (unchanged for the debug log). */
  initialAnchor?: "top" | "bottom";
}
