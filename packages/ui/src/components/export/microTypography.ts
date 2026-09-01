/**
 * French micro-typography for EXPORTED documents — the « composition » half of the
 * design nobody sees but everyone feels: a line must never
 * start with « ! » nor separate « 12 » from « 000 € ».
 *
 * One single golden rule, which is what makes this module SAFE: we only replace
 * an ordinary space ALREADY THERE with a non-breaking one — never insert, remove or
 * rewrite a character. Badly-spaced text comes out badly spaced (it's the model's
 * job to write correctly, the prompt tells it so); correctly-spaced text becomes unbreakable.
 * That's why there are NEITHER « smart » quotes NOR automatic hyphenation here:
 * transforming `'` or breaking a word is generative, and wrong on code, a proper noun
 * or English.
 *
 * U+00A0 (FULL non-breaking space), not U+202F (thin): the thin one doesn't exist in WinAnsi,
 * and the pdf-lib fallback (`documentPdf.ts` `toWinAnsi`) must be able to print the same text.
 *
 * Applied at the moment blocks are READ (`documentBlocks.ts` `runsOf`), so the
 * three exports (HTML→PDF, DOCX, pdf-lib fallback) receive it from a single point — never
 * on `code` runs, where a space is a character like any other. It sees the REAL
 * values (the export carries the un-redacted); changing a space's nature alters neither
 * the coffre nor the stored document — the path is export-only.
 */

const NBSP = " ";

/** Simple space → non-breaking, only at the positions where French typography
 *  requires it AND where the intent is unambiguous. */
export function frenchSpacing(text: string): string {
  return (
    text
      // Before high punctuation and the closing guillemet — only when it is
      // TERMINAL (followed by a space or an end), which rules out at once
      // smileys « :) » / « ;( » and any non-typographic use. The space must already
      // exist: « https://x » (nothing before the « : ») doesn't match either.
      .replace(/ ([:;!?»])(?=\s|$)/g, `${NBSP}$1`)
      // After the opening guillemet.
      .replace(/« /g, `«${NBSP}`)
      // Thousands grouping: « 12 000 » — the space between a digit and a group of
      // THREE digits at the end of a number. A phone number (« 06 12 34 56 78 », groups of 2),
      // two years (« 2026 2027 », group of 4) don't match.
      .replace(/(\d) (?=\d{3}(?!\d))/g, `$1${NBSP}`)
      // Number + currency symbol or %: « 500 € », « 45 % ».
      .replace(/(\d) (?=[€%$£])/g, `$1${NBSP}`)
  );
}
