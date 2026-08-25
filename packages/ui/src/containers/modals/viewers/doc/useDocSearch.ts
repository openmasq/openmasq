import { useEffect, useMemo, useRef, useState } from "react";
import { countMatches, type DocChunk } from "./docSearch";

/**
 * Find-in-document state for the attachment preview text tabs. Owns the query, the
 * active-match index, prev/next navigation and the ref of the active `<mark>` (so
 * the caller scrolls it into view). `total` is computed over the SAME chunks the
 * renderer highlights, so counts and highlights agree.
 */
export function useDocSearch(chunks: DocChunk[]) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const activeRef = useRef<HTMLElement | null>(null);

  const total = useMemo(
    () => chunks.reduce((n, c) => n + countMatches(c.text, query), 0),
    [chunks, query],
  );

  // Keep the active hit in range as the count changes (new query, or a revealed
  // value shifting the redacted segments).
  useEffect(() => {
    setActive((a) => (total === 0 ? 0 : Math.min(a, total - 1)));
  }, [total]);

  // Bring the active match into view (also on query change → jumps to the first hit).
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [active, query]);

  const go = (delta: number) => {
    if (total > 0) setActive((a) => (a + delta + total) % total);
  };

  return {
    query,
    total,
    active,
    activeRef,
    /** Set the query and reset the highlight to the first match. */
    setQuery: (q: string) => {
      setQuery(q);
      setActive(0);
    },
    next: () => go(1),
    prev: () => go(-1),
  };
}
