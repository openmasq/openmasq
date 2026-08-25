import { useEffect, useRef, useState } from "react";
import type { CSSProperties, RefObject } from "react";
import { BRAND } from "@openmasq/branding";

const KEY = `${BRAND.slug}:split-ratio`;

/**
 * The draggable split ratio — the RIGHT pane's width fraction (browser / artifact /
 * document). Persisted so the chosen layout survives a reload, clamped on read so a
 * corrupted value can't collapse a pane. `style` is what `.chat-split` reads.
 */
export function useSplitRatio(): {
  ref: RefObject<HTMLDivElement>;
  ratio: number;
  setRatio: (r: number) => void;
  style: CSSProperties;
} {
  const ref = useRef<HTMLDivElement>(null);
  const [ratio, setRatio] = useState<number>(() => {
    const v = typeof localStorage !== "undefined" ? parseFloat(localStorage.getItem(KEY) ?? "") : NaN;
    return Number.isFinite(v) && v >= 0.25 && v <= 0.75 ? v : 0.46;
  });
  useEffect(() => {
    try {
      localStorage.setItem(KEY, String(ratio));
    } catch {
      /* storage unavailable */
    }
  }, [ratio]);
  return {
    ref,
    ratio,
    setRatio,
    style: { "--split-right": `${(ratio * 100).toFixed(2)}%` } as CSSProperties,
  };
}
