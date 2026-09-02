import { hueForKind } from "@openmasq/redact";
import { DEFAULT_LOCALE, getMessages, type Messages } from "@openmasq/i18n";

/**
 * The first-run DEMONSTRATION: one realistic sentence, and what the model receives
 * instead. Pure data — the animation is `RedactionDemo.tsx`.
 *
 * Why a hand-authored pair rather than a live redaction pass: onboarding runs before the
 * detector is warm, and a first screen that waits on a worker is a first screen that
 * stalls. So this is presented as an EXAMPLE, and it only claims what is actually true —
 * a name becomes another name, an e-mail another e-mail, a company another company.
 * Its colours are NOT hand-picked either: they come from `hueForKind`, the same mapping
 * the real marks use, so the demo wears the app's own palette.
 */

export interface DemoSpan {
  /** Plain text between sensitive spans, or the REAL value of one. */
  text: string;
  /** What the model receives instead. Absent ⇒ this span is not sensitive. */
  fake?: string;
  /** Redaction kind — drives the hue AND the category label under the demo. */
  kind?: string;
}

export const DEMO_SPANS: readonly DemoSpan[] = [
  { text: "Relance " },
  { text: "Camille Berliand", fake: "Léa Chandrel", kind: "name" },
  { text: " (" },
  { text: "camille@atelier-torbel.fr", fake: "lea@karl-studio.fr", kind: "email" },
  { text: ") au " },
  { text: "06 12 34 56 78", fake: "07 61 90 24 15", kind: "phone" },
  { text: " à propos du devis " },
  { text: "Atelier Torbel", fake: "Karl Studio", kind: "company" },
  { text: "." },
];

export interface DemoLegendItem {
  kind: string;
  label: string;
  hue: string;
}

/** The legend under the demo: one chip per DISTINCT kind, in order of appearance. The
 *  label is the redaction type's own (`t.redactTypes`, the catalogue) — never a local
 *  table, so the demo names a kind the way the rest of the app does. Default catalogue
 *  = the source language, for a caller outside React (a test, a hue lookup). */
export function demoLegend(
  t: Messages = getMessages(DEFAULT_LOCALE),
  spans: readonly DemoSpan[] = DEMO_SPANS,
): DemoLegendItem[] {
  const labels = t.redactTypes as unknown as Record<string, string | undefined>;
  const seen = new Set<string>();
  const out: DemoLegendItem[] = [];
  for (const s of spans) {
    if (!s.kind || seen.has(s.kind)) continue;
    seen.add(s.kind);
    out.push({ kind: s.kind, label: labels[s.kind] ?? s.kind, hue: hueForKind(s.kind) });
  }
  return out;
}

/** The sentence as the user typed it / as the model receives it. */
export const demoText = (spans: readonly DemoSpan[], side: "real" | "fake"): string =>
  spans.map((s) => (side === "fake" && s.fake ? s.fake : s.text)).join("");
