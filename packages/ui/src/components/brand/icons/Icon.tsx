import { type CSSProperties, type ReactNode } from "react";

/* ───────────────────────────── Lucide icons ──────────────────────────────
   2px stroke line icons (the redact set). Asset-free, sized via props.

   The design system fixes the set: Lucide, 24×24, stroke 2, round caps/joins — no
   emoji, no unicode glyph, no hand-drawn one-off. A new icon is a real Lucide path
   pasted into the themed file it belongs to, never an improvised shape. */

export function Icon({
  size = 20,
  stroke = 2,
  children,
  style,
}: {
  size?: number;
  stroke?: number;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="cv-icon"
      style={style}
    >
      {children}
    </svg>
  );
}
