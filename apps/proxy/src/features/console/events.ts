// What the console is fed. The `Reporter` already sees every model request and every MCP
// tool call — this turns that into a stream a browser can read, and it is the ONLY place
// that decides what a page is allowed to know.
//
// ⚠️ **The reveal decision lives here, not in the page.** A terminal shows a real value on
// the operator's own screen; an HTTP endpoint is reachable by every process on the machine,
// and a page can be screenshotted, extended and left open. So the real value is only ever
// put on the wire when the run was started with `--reveal`; otherwise a subscriber gets the
// substitute — what the model saw — and the counts. A page cannot ask for more than the run
// granted, because the server never sends it.
import { categoriesForLevel, REDACTION_CATEGORIES, type RedactionLevel } from "@openmasq/catalog";
import { MCP_CATEGORIES, MCP_CONNECTORS, MCP_LOGO_IMAGES, MCP_LOGOS } from "@openmasq/catalog/mcp";
import { getMessages } from "@openmasq/i18n";
import {
  CATEGORY_SECTION,
  REDACTION_SECTIONS,
  redactionCategory,
  type RedactionMatch,
} from "@openmasq/redact";
import type { RequestEvent } from "../../lib/ui/index.js";

export interface ConsoleItem {
  /** The redaction SECTION's slug (`identite`, `financier`…) — which is also the name of the
   *  design token that colours it. The engine speaks in fine categories (`email`, `iban`),
   *  the palette in the nine sections, and `CATEGORY_SECTION` is the one home of that
   *  mapping: deriving it here means the page never guesses a colour. */
  cat: string;
  /** What the model saw. */
  fake: string;
  /** The real value — present ONLY under `--reveal`. */
  real?: string;
  /** The fine category's own label (`E-mail`, `IBAN`), for the per-value view. Taken from
   *  `@openmasq/catalog`, which owns the labels — never invented here. */
  type: string;
  /** How many times this value occurred in the call. */
  n: number;
}

export interface ConsoleEvent {
  t: string;
  method: string;
  path: string;
  family: string;
  status: number;
  ms: number;
  stream: boolean;
  session?: string;
  items: ConsoleItem[];
}

export interface ConsoleBus {
  /** Feed one reported request. */
  publish(e: RequestEvent): void;
  /** Subscribe; the returned function unsubscribes. */
  subscribe(fn: (e: ConsoleEvent) => void): () => void;
  /** What a page gets on connect, so a tab opened late is not blank. */
  backlog(): ConsoleEvent[];
  readonly reveal: boolean;
  subscribers(): number;
}

const MAX_BACKLOG = 500;

/**
 * A section label (`Identité`) → the token slug the design system uses (`identite`).
 * Deterministic and reversible by eye, which is what lets `console.test.ts` check that every
 * section the product declares lands on an id the page actually paints — a new section would
 * otherwise fall silently into the grey "systeme" bucket.
 */
export const sectionSlug = (label: string): string =>
  label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

/** The section a match belongs to, or the neutral bucket when the category is unknown. */
export function sectionOf(match: RedactionMatch): string {
  const section = CATEGORY_SECTION[fineOf(match)];
  return section ? sectionSlug(section) : "systeme";
}

const fineOf = (match: RedactionMatch): ReturnType<typeof redactionCategory> =>
  redactionCategory(match.category ?? match.type ?? "");

/** The console is in English — the CLI's language — so its labels come from the product's
 *  English catalogue (`@openmasq/i18n`), the same words the app's rules screen shows in that
 *  language. Never a table of its own: a category added upstream arrives translated or,
 *  failing that, under the catalogue's source label, but never invented here. */
const EN = getMessages("en").redactionCatalog;
const enCategory = (key: string) =>
  (EN.categories as Record<string, { label: string; detail?: string } | undefined>)[key];
const enSection = (fr: string) => (EN.sections as Record<string, string | undefined>)[fr] ?? fr;

/** `email` → `E-mail`. The catalogue owns these labels; the console only reads them. */
const LABELS = new Map(REDACTION_CATEGORIES.map((c) => [c.key, enCategory(c.key)?.label ?? c.label]));
export const typeOf = (match: RedactionMatch): string => {
  const fine = fineOf(match);
  return LABELS.get(fine) ?? fine;
};

const clock = (at: number): string => {
  const d = new Date(at);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

/** One match → one item, minus the real value unless the run revealed. De-duplicated by
 *  value: a path repeated forty times in one prompt would otherwise be forty rows. */
function itemsOf(matches: RedactionMatch[], reveal: boolean): ConsoleItem[] {
  const seen = new Map<string, ConsoleItem>();
  for (const m of matches) {
    if (!m.placeholder) continue;
    const already = seen.get(m.value);
    // Folded rather than dropped: the per-value view counts occurrences, and a path repeated
    // forty times in one prompt is ONE value seen forty times, not forty rows.
    if (already) {
      already.n += 1;
      continue;
    }
    seen.set(m.value, {
      cat: sectionOf(m),
      fake: m.placeholder,
      type: typeOf(m),
      n: 1,
      ...(reveal ? { real: m.value } : {}),
    });
  }
  return [...seen.values()];
}

export function createConsoleBus(reveal: boolean, now: () => number = Date.now): ConsoleBus {
  const listeners = new Set<(e: ConsoleEvent) => void>();
  const backlog: ConsoleEvent[] = [];

  return {
    reveal,
    subscribers: () => listeners.size,
    backlog: () => [...backlog],
    subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    publish(e) {
      const event: ConsoleEvent = {
        t: clock(now()),
        method: e.method,
        // The query string is dropped, here as on the terminal: a Gemini key travels in
        // `?key=`, and a console is not a reason to start showing it.
        path: e.path.split("?")[0],
        family: e.family,
        status: e.status,
        ms: Math.round(e.ms),
        stream: e.stream,
        ...(e.session ? { session: e.session } : {}),
        items: itemsOf(e.matches, reveal),
      };
      backlog.push(event);
      if (backlog.length > MAX_BACKLOG) backlog.shift();
      for (const fn of listeners) fn(event);
    },
  };
}

/** The sections the page paints, in the product's own order, with the product's own labels.
 *  Sent on connect so the page carries no list of its own — the kit's hard-coded eight left
 *  `Système` unlabelled the moment a file path was masked. */
export const sections = (): { id: string; label: string }[] =>
  REDACTION_SECTIONS.map((fr) => ({ id: sectionSlug(fr), label: enSection(fr) }));

/**
 * The MCP connector CATALOG — the same list the desktop app shows, so the console's MCP panel
 * lists every service that CAN be connected, not only the ones live on this run. One home for
 * the list (`@openmasq/catalog`), sent on connect so the page carries none of its own. Display
 * metadata only — id, name, category, the design-system hue (`tone`) its tile is painted in,
 * and the brand MARK; never a credential.
 *
 * The mark travels WITH the list because the page may fetch nothing from anywhere (`../../
 * CLAUDE.md`: a privacy console that phoned a CDN would be its own counter-example). Two
 * shapes, both self-contained: `logo` is a 24×24 single path plus its official hex, `img` a
 * `data:` PNG for the brands that publish no monochrome glyph. A connector with neither —
 * the local filesystem server, a custom one — keeps the coloured letter tile, which is what
 * the desktop does too. Both come from `@openmasq/catalog/mcp`, the one home of the list.
 */
export const connectorCatalog = (): {
  categories: { id: string; label: string }[];
  connectors: {
    id: string;
    name: string;
    category: string;
    tone: string;
    logo?: { path: string; hex: string };
    img?: string;
  }[];
} => ({
  categories: MCP_CATEGORIES.map((c) => ({ id: c.id, label: c.label })),
  connectors: MCP_CONNECTORS.map((c) => {
    const logo = MCP_LOGOS[c.id];
    const img = MCP_LOGO_IMAGES[c.id];
    return {
      id: c.id,
      name: c.name,
      category: c.category ?? "autres",
      tone: c.tone ?? "slate",
      ...(logo ? { logo } : {}),
      ...(img ? { img } : {}),
    };
  }),
});

/**
 * The masking RULES the page may show: the product's own sections, each with the categories
 * the catalogue puts in it, their labels and the sentence the app shows beside them. The
 * STRUCTURE only — what is on right now is `activeCategories`, small enough to re-read while
 * the run's level changes under the `l` key.
 *
 * Sent rather than known: the page has no list of its own (`sections` says why), and a
 * catalogue entry added upstream must reach this panel without an edit here.
 */
export const rules = (): {
  id: string;
  label: string;
  items: { key: string; label: string; detail?: string; ai: boolean }[];
}[] =>
  REDACTION_SECTIONS.map((fr) => ({
    id: sectionSlug(fr),
    label: enSection(fr),
    items: REDACTION_CATEGORIES.filter((c) => c.group === fr).map((c) => {
      const en = enCategory(c.key);
      const detail = en?.detail ?? c.detail;
      return { key: c.key, label: en?.label ?? c.label, ...(detail ? { detail } : {}), ai: !!c.ai };
    }),
  }));

/**
 * Which categories this run actually masks: the level's own arithmetic
 * (`categoriesForLevel`), minus what `--disable` turned off. The SAME two inputs the masker
 * reads — never a second reading of the rules, which is how a panel ends up claiming a
 * category the engine is not looking for.
 */
export const activeCategories = (level: RedactionLevel, disabled: readonly string[]): string[] => {
  const on = categoriesForLevel(level);
  return REDACTION_CATEGORIES.filter((c) => on[c.key] && !disabled.includes(c.key)).map(
    (c) => c.key,
  );
};
