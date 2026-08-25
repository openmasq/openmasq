import { useLayoutEffect, useRef, useState } from "react";

/**
 * Measure the available width of the document "desk" (the scroll area holding the page
 * sheets). Recomputes on container resize (modal / window resize) via a `ResizeObserver`,
 * so {@link pageMetrics} can size the sheets to fit. Returns the ref to attach + the
 * measured width (0 until first measured).
 */
export function useContainerWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [availWidth, setAvailWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setAvailWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, availWidth };
}
