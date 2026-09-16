// WHO MAY SEE A REAL VALUE, on the page and in what leaves it as a file — a privacy boundary,
// kept as a testable module. TWO conditions, both required: `sent` is what the RUN decided
// (`--no-console-reveal` ⇒ the server never puts an original on the wire), `shown` is what
// the READER decided with the toggle. An export must honour the pair exactly as the screen
// does — a file is the one copy that outlives the tab.

/** An item as the bus sends it: the substitute always, the original only under reveal. */
export interface WireItem {
  /** The substitute — what actually left the machine. Always present. */
  tok?: string;
  /** The original. Absent whenever the run was started with `--no-console-reveal`. */
  real?: string;
  [k: string]: unknown;
}

export interface WireEvent {
  items?: WireItem[];
  [k: string]: unknown;
}

/** The run sent originals AND the reader asked for them. Fails toward HIDING: an unknown
 *  state is not a licence to print someone's name. */
export const mayReveal = (sent: boolean, shown: boolean): boolean =>
  sent === true && shown === true;

/** One event, prepared to leave the page. A deep copy, so stripping never reaches back into
 *  the live log the screen is still drawing from. */
export function exportableEvent(raw: WireEvent | null | undefined, allowed: boolean): WireEvent {
  if (!raw) return {};
  const out = structuredClone(raw) as WireEvent;
  if (!allowed) for (const item of out.items ?? []) delete item.real;
  return out;
}

export interface ExportDoc {
  app: "openmasq-proxy";
  exported: string;
  /** Says on the FILE whether it carries originals, so a reader who finds it later knows
   *  what they are holding without opening every event. */
  reveal: boolean;
  events: WireEvent[];
}

/** The whole journal as a file. Newest-last, so the document reads in the order things
 *  happened rather than in the order the screen stacked them. */
export function exportDocument(
  events: readonly (WireEvent | null | undefined)[],
  opts: { sent: boolean; shown: boolean; now?: Date },
): ExportDoc {
  const allowed = mayReveal(opts.sent, opts.shown);
  return {
    app: "openmasq-proxy",
    exported: (opts.now ?? new Date()).toISOString(),
    reveal: allowed,
    events: events.map((e) => exportableEvent(e, allowed)),
  };
}

/** The file's name: the moment, flattened to something a filesystem accepts everywhere. */
export const exportFilename = (now = new Date()): string =>
  `openmasq-journal-${now.toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
