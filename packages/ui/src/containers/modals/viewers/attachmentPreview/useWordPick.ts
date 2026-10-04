import { useEffect, useRef, useState } from "react";

export interface WordPick {
  value: string;
  x: number;
  y: number;
}

/**
 * Click-a-word on a CANVAS view (PDF page or scanned image): the clicked word + the viewport
 * anchor for the «Masquer “mot”» type picker. The viewer's LOCKED pre-highlight is released
 * when the picker closes (dismiss or pick); any mousedown outside the menu dismisses it.
 */
export function useWordPick() {
  const [wordPick, setWordPick] = useState<WordPick | null>(null);
  const releaseRef = useRef<(() => void) | null>(null);
  const open = (value: string, x: number, y: number, release: () => void) => {
    releaseRef.current?.();
    releaseRef.current = release;
    setWordPick({ value, x, y });
  };
  const close = () => {
    releaseRef.current?.();
    releaseRef.current = null;
    setWordPick(null);
  };
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!wordPick) return;
    const away = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest?.("[data-sel-menu]")) closeRef.current();
    };
    document.addEventListener("mousedown", away, true);
    return () => document.removeEventListener("mousedown", away, true);
  }, [wordPick]);
  return { wordPick, open, close };
}
