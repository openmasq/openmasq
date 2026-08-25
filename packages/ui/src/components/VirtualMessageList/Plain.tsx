import { useLayoutEffect } from "react";
import type { Props } from "./types";

/** Small conversation → render every bubble directly (rows always mounted). */
export function Plain<T>({ items, children, scrollRef, apiRef }: Props<T>) {
  useLayoutEffect(() => {
    if (!apiRef) return;
    apiRef.current = {
      scrollToKey: (key: string) => {
        const el = scrollRef.current?.querySelector<HTMLElement>(
          `[data-mid="${CSS.escape(key)}"]`,
        );
        if (!el) return false;
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        return true;
      },
    };
    return () => {
      if (apiRef) apiRef.current = null;
    };
  });
  return <>{items.map((it, i) => children(it, i))}</>;
}
