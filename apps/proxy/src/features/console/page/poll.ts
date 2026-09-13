// WHEN THE MASKING PANEL HAS TO BE REDRAWN — and, much more often, when it must be left
// alone.
//
// The page polls `/healthz` every five seconds, because the `l` key moves the level under an
// open tab and a panel claiming the wrong level is worse than no panel. But the panel is
// rebuilt with `innerHTML`, so redrawing it unconditionally threw away everything the reader
// had done inside it — the scroll, a collapsed category, the connector they had just found in
// a list of fifty-seven — every five seconds, forever. It read as the page reloading itself,
// which is exactly what it was.
//
// The poll answers with the same values almost every time. So: keep the last answer, redraw
// only on a real difference. Nothing here is an optimisation — a panel that rebuilds under
// the reader's hands is a broken panel, and this is the fix.

/** The parts of `/healthz` the panel actually draws from. Anything else can change freely. */
export interface MaskingState {
  level?: string;
  mode?: string;
  /** The categories in force — an array, re-sent whole on every poll. */
  masking?: readonly string[];
  /** Whether the local model is loaded; the level tile's wording turns on it. */
  ner?: boolean;
}

/**
 * A value that is equal for two equal states. The categories are joined rather than compared
 * element by element because the server sends them in a stable order — and if that ever stops
 * being true the panel redraws once too often, which is the harmless direction.
 */
export function maskingSignature(h: MaskingState | null | undefined): string {
  if (!h) return "";
  return [h.level ?? "", h.mode ?? "", h.ner === false ? "0" : "1", (h.masking ?? []).join(",")].join(
    "|",
  );
}

/**
 * Tracks the last state the panel was drawn from. `changed()` is true on the FIRST call —
 * the panel has never been drawn — and thereafter only when something it displays moved.
 */
export function createMaskingWatch(): { changed: (h: MaskingState | null | undefined) => boolean } {
  let last: string | undefined;
  return {
    changed(h) {
      const next = maskingSignature(h);
      if (last === next) return false;
      last = next;
      return true;
    },
  };
}
