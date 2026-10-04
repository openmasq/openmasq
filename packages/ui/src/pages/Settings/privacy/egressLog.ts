import type { Messages } from "@openmasq/i18n";
import type { EgressEntry } from "../../../host";

/**
 * Pure shaping for the network journal (« Ce qui est sorti de la machine »).
 *
 * The tab above it answers "what was redacted"; this answers the other half of the same
 * promise — *which hosts did this app actually talk to*. A flat list of hops is unreadable
 * (one page load is a dozen), so the view groups by ORIGIN and keeps the counts.
 *
 * Kept out of the `.tsx` (root convention: logic in `.ts`) so the grouping and the labels
 * are unit-testable without mounting anything.
 */

export interface EgressGroup {
  origin: string;
  /** Bare host, for display — the scheme is carried by `insecure` instead. */
  host: string;
  /** `http://` rather than `https://`: worth showing, never worth hiding. */
  insecure: boolean;
  total: number;
  refused: number;
  /** Most recent contact, ms. */
  lastAt: number;
  /** Distinct subsystems that reached this origin, in first-seen order. */
  sources: string[];
  /** Our own wording for the most recent refusal, when there was one. */
  lastRefusalReason?: string;
}

/** The label (UI language) of a `source` value main writes. An unknown source falls back
 *  to itself rather than to "other": a new subsystem should read as ITSELF in the journal,
 *  even before someone remembers to name it in the catalogue (`t.runtime.misc.egressSources`). */
export function sourceLabel(source: string, t: Messages): string {
  const labels = t.runtime.misc.egressSources;
  return Object.hasOwn(labels, source) ? labels[source as keyof typeof labels] : source;
}

/** Group by origin, newest group first. Input is expected newest-first (the host returns
 *  it that way); the function does not rely on it beyond `lastAt`, which it maximises. */
export function groupEgress(entries: EgressEntry[], t: Messages): EgressGroup[] {
  const byOrigin = new Map<string, EgressGroup>();
  for (const e of entries) {
    let g = byOrigin.get(e.origin);
    if (!g) {
      const insecure = e.origin.startsWith("http://");
      g = {
        origin: e.origin,
        host: e.origin.replace(/^https?:\/\//, ""),
        insecure,
        total: 0,
        refused: 0,
        lastAt: 0,
        sources: [],
      };
      byOrigin.set(e.origin, g);
    }
    g.total++;
    if (e.verdict === "refused") {
      g.refused++;
      if (e.at >= g.lastAt && e.reason) g.lastRefusalReason = e.reason;
    }
    if (e.at > g.lastAt) g.lastAt = e.at;
    const label = sourceLabel(e.source, t);
    if (!g.sources.includes(label)) g.sources.push(label);
  }
  return [...byOrigin.values()].sort((a, b) => b.lastAt - a.lastAt);
}

export interface EgressSummary {
  origins: number;
  contacts: number;
  refused: number;
}

export function summarise(groups: EgressGroup[]): EgressSummary {
  return {
    origins: groups.length,
    contacts: groups.reduce((n, g) => n + g.total, 0),
    refused: groups.reduce((n, g) => n + g.refused, 0),
  };
}

/** Free-text filter over host and source labels. Empty query keeps everything. */
export function filterEgress(groups: EgressGroup[], query: string): EgressGroup[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return groups;
  return groups.filter(
    (g) =>
      g.host.toLowerCase().includes(needle) ||
      g.sources.some((s) => s.toLowerCase().includes(needle)),
  );
}
