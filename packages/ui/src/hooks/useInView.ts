import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * Latched viewport visibility via `IntersectionObserver`: returns a ref to attach and
 * a boolean that flips true the first time the element comes near the viewport and
 * STAYS true (the observer disconnects). Used to gate loading a library thumbnail's
 * bytes until its card is (nearly) visible, so an off-screen image is never read from
 * the DB nor decoded. `rootMargin` pre-loads slightly ahead so scrolling stays smooth.
 * Degrades to "always visible" where `IntersectionObserver` is absent (old webviews).
 */
export function useInView<T extends Element>(
  rootMargin = "400px",
): [RefObject<T>, boolean] {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (inView) return; // already latched — nothing to observe
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          io.disconnect();
        }
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [inView, rootMargin]);

  return [ref, inView];
}
