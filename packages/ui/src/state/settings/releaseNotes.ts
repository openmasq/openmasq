import type { Messages } from "@openmasq/i18n";
import { useEffect } from "react";
import { useHost } from "../../host";
import { useAppDispatch, useAppSelector } from "../redux";
import { selectReleaseNotesCache } from "./settingsCache";
import { loadReleaseNotes } from "./settingsPrefetch";

// The published RELEASE NOTES (Contentful, served by analytics-fn `/release-notes`):
// the type, the cache reader, and the pure formatting the two surfaces share.
//
// ⚠️ Lives here, in the DATA layer, and no longer under `pages/Settings/updates/`: the
// Redux cache and the prefetch were already importing this type from `pages/` (a low
// layer reaching up), and the HELP modal — a `containers/` — couldn't have imported it at all.
// Two readers, one home.

/** The stable shape the analytics-fn `/release-notes` endpoint returns per note. */
export interface ReleaseNote {
  version: string;
  releaseDate: string | null;
  title: string;
  body: string;
  highlights: string[];
}

export interface UseReleaseNotes {
  notes: ReleaseNote[];
  loading: boolean;
  /** True when the host exposes no release-notes URL (browser preview / relay off). */
  unavailable: boolean;
  error: string | null;
}

/** PURE cache reader: the loading is done once by `settingsPrefetch`
 *  (`loadReleaseNotes`), so returning to the screen is instant. */
export function useReleaseNotes(): UseReleaseNotes {
  const host = useHost();
  const url = host.releaseNotesUrl;
  const { notes, loaded } = useAppSelector(selectReleaseNotesCache);
  return { notes, loading: !!url && !loaded, unavailable: !url, error: null };
}

/**
 * The same cache, but which LOADS ITSELF if it isn't yet — for a surface reachable
 * without going through Réglages (help opens from the rail).
 *
 * ⚠️ One single home for this trigger: `loadReleaseNotes` is idempotent cache-side
 * (it writes `loaded`), so a second reader re-downloads nothing — but the CONDITION
 * "load if nobody has" copied into every screen is exactly what
 * leaves a tab empty for whoever didn't take the right path.
 */
export function useReleaseNotesFeed(): UseReleaseNotes {
  const host = useHost();
  const dispatch = useAppDispatch();
  const state = useReleaseNotes();
  const { unavailable, loading } = state;
  useEffect(() => {
    if (!unavailable && loading) void loadReleaseNotes(host, dispatch);
  }, [host, dispatch, unavailable, loading]);
  return state;
}

/** Normalise a version for matching: drop a leading "v" and any pre-release suffix
 *  ("4.9.0-staging.12" / "4.9.0-rc1" → "4.9.0"). */
export const baseVersion = (v: string): string => v.replace(/^v/, "").split("-")[0];

/**
 * ONE note per version. The endpoint returns SEVERAL for the same version (a
 * welcome note and the real one, a republished fix), sorted from most recent to
 * oldest: so the FIRST one seen is kept. Without this, the history displayed « 0.4.1 »
 * twice in a row — which reads as an app bug, not as two notes.
 * Same rule as the Réglages build↔note matching (`noteLookup`), just once.
 */
export function latestPerVersion(notes: readonly ReleaseNote[]): ReleaseNote[] {
  const seen = new Set<string>();
  const out: ReleaseNote[] = [];
  for (const n of notes) {
    const key = baseVersion(n.version ?? "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(n);
  }
  return out;
}

/**
 * THE note for a version — the only way to go from a build number to what it
 * brings. Tolerates the pre-release suffix (`0.5.0-staging.12` → `0.5.0`), applies the
 * "one note per version" rule, and returns `undefined` rather than inventing one.
 *
 * One single home (rule 9): the Réglages build↔note matching, a downloaded update's
 * announcement, and the help history all ask the same question.
 */
export function noteForVersion(
  notes: readonly ReleaseNote[],
  version: string | undefined,
): ReleaseNote | undefined {
  if (!version) return undefined;
  const key = baseVersion(version);
  return latestPerVersion(notes).find((n) => baseVersion(n.version) === key);
}

// The six highlight-palette hues, cycled per highlight bullet (the brand's signature
// redaction-marker colours). Maps to the `--hl-*` tokens via the `.rn-dot-<tone>` class.
export const HL_TONES = ["pink", "amber", "sky", "lime", "mint", "violet"] as const;

/**
 * "2026-07-11T…" → « 11 juillet 2026 » / "11 July 2026"; non-ISO or `null` rendered as-is.
 *
 * `Intl.DateTimeFormat` rather than a month table: it used to be called `frenchDate` and
 * hard-coded the twelve French names, so an English-language app dated its versions in
 * French. The date is built in UTC — a bare ISO (`2026-07-11`) is midnight UTC, and
 * displaying it in the local timezone pushed it back a day west of Greenwich.
 */
export function releaseDate(iso: string | null, t: Messages): string {
  if (!iso) return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  try {
    return new Intl.DateTimeFormat(t.common.intlTag, {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(d);
  } catch {
    return iso; // `Intl` unavailable (never in Electron nor a browser) — never a blank
  }
}

/** "Titre — bénéfice" → { title, body }; a plain string → { title }. */
export function splitHighlight(s: string): { title: string; body?: string } {
  const m = s.match(/^(.+?)\s*[—–:-]\s*(.+)$/);
  return m ? { title: m[1].trim(), body: m[2].trim() } : { title: s.trim() };
}

// ---- Highlight grouping (mirrors the design-system VersionsSection's 3 colour-
// coded sections: Nouveautés / Améliorations / Corrections). Contentful stores a
// FLAT `highlights` list, so a note opts a bullet into a group by PREFIXING it with
// a category token (`feat:` / `imp:` / `fix:`, a few synonyms each). An un-prefixed
// bullet — every existing note — falls into "Nouveautés", so flat notes render
// exactly as before while an authored note gets the design's colour groups.

export type HighlightGroupKey = "feat" | "imp" | "fix";

export interface HighlightGroup {
  key: HighlightGroupKey;
  /** The section header ("Nouveautés" / "Améliorations" / "Corrections"). */
  label: string;
  /** The `.ver-reldot` tone modifier class (empty = the default lime dot). */
  tone: string;
  /** The bullets (with their leading category token stripped). */
  items: string[];
}

// Ordered so groups always render Nouveautés → Améliorations → Corrections. `match`
// tests ONLY a bullet's leading `token:` word — a bullet whose leading word isn't a
// recognised category keeps its full text (never mis-stripped) under `feat`.
const GROUP_META: { key: HighlightGroupKey; tone: string; match: RegExp }[] = [
  { key: "feat", tone: "", match: /^(feat|feature|new|nouveaut[eé]s?|nouveau)$/i },
  { key: "imp", tone: "imp", match: /^(imp|improvement|perf|am[eé]lioration|enhance)$/i },
  { key: "fix", tone: "fix", match: /^(fix|bug|correction|hotfix)$/i },
];

/** Classify a highlight by its optional leading `category:` token. Only strips the
 *  token when it matches a known category — otherwise the full text is kept. */
function classifyHighlight(h: string): { key: HighlightGroupKey; text: string } {
  const m = h.match(/^\s*([A-Za-zÀ-ÿ]+)\s*[:：]\s*(.*)$/);
  if (m) {
    for (const g of GROUP_META) if (g.match.test(m[1])) return { key: g.key, text: m[2].trim() };
  }
  return { key: "feat", text: h.trim() };
}

/** Bucket a note's flat `highlights` into the (non-empty) design groups, in order. */
export function groupHighlights(highlights: string[], t: Messages): HighlightGroup[] {
  const buckets: Record<HighlightGroupKey, string[]> = { feat: [], imp: [], fix: [] };
  for (const h of highlights) {
    if (!h || !h.trim()) continue;
    const { key, text } = classifyHighlight(h);
    if (text) buckets[key].push(text);
  }
  return GROUP_META.filter((g) => buckets[g.key].length > 0).map((g) => ({
    key: g.key,
    label: t.chrome.releaseKinds[g.key],
    tone: g.tone,
    items: buckets[g.key],
  }));
}
