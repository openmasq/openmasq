import { useEffect, useRef, useState } from "react";
import { ChevDownIcon } from "../../../components/brand";
import { BrandLoader } from "../../../components/media/BrandLogo";
import { compareVersions } from "./useUpdates";
import { baseVersion, latestPerVersion, type ReleaseNote } from "../../../state/releaseNotes";
import { ReleaseNoteBody } from "../../../components/releaseNotes";
import type { DesktopRelease } from "../../../host";

// The version HISTORY list of the Versions tab — a card list of published builds,
// each expandable to its Contentful release notes (fetched from analytics-fn and
// matched by version). Mirrors the design-system `VersionsSection`. Split out of
// `UpdatesSection` to keep both files under the 300-LOC limit.

/** Build a `version → ReleaseNote` lookup that tolerates the build's pre-release
 *  suffix (the Contentful note is keyed on the base X.Y.Z). La règle « une note par
 *  version, la plus récente » est `latestPerVersion` — partagée avec l'historique de
 *  l'aide, qui l'applique à la même liste (règle 9). */
export function noteLookup(notes: ReleaseNote[]): (version: string) => ReleaseNote | undefined {
  const byBase = new Map(latestPerVersion(notes).map((n) => [baseVersion(n.version), n]));
  return (version: string) => byBase.get(baseVersion(version));
}
// ⚠️ Le point-à-point est `state/releaseNotes.ts` `noteForVersion` (même règle, une seule
// maison) ; ce lookup-ci ne survit que parce qu'il PRÉ-INDEXE pour une liste entière —
// appeler le premier par ligne re-trierait les notes à chaque rendu de l'historique.

// Release lifecycle → the coloured state pill next to the version (mirrors the DS
// VersionsSection): the running build is "Installée", a newer published build
// "Disponible", anything older "Précédente".
const STATE_LABEL: Record<string, string> = {
  current: "Installée",
  available: "Disponible",
  past: "Précédente",
};

// The history renders a PAGE at a time, growing as a bottom sentinel scrolls into
// view (infinite scroll) — a long channel (dozens of staging builds) doesn't mount
// every row at once. Rows start EXPANDED (all notes open); a row can be collapsed
// individually via its chevron.
const PAGE_SIZE = 12;

/** A card list of releases: version + state pill + a one-line lead, each row showing
 *  its release notes expanded (collapsible via the chevron). Rendered page-by-page
 *  with an infinite-scroll sentinel. `action(r, cur)` is the right-aligned control
 *  (install / rollback / switch button, or the "Actuelle" tag). */
export function ReleaseTable({
  releases,
  isCurrent,
  currentVersion,
  noteFor,
  action,
}: {
  releases: DesktopRelease[];
  isCurrent: (r: DesktopRelease) => boolean;
  /** The running build's version, to classify each row as newer/older. */
  currentVersion?: string;
  /** The Contentful release note for a build version (from analytics-fn), if any. */
  noteFor: (version: string) => ReleaseNote | undefined;
  action: (r: DesktopRelease, cur: boolean) => React.ReactNode;
}) {
  // Versions the user has manually COLLAPSED (default = all expanded).
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const toggle = (version: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(version)) next.delete(version);
      else next.add(version);
      return next;
    });

  // Infinite scroll: render `limit` rows, grow by a page when the sentinel appears.
  const [limit, setLimit] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setLimit((l) => l + PAGE_SIZE);
      },
      { rootMargin: "300px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [releases.length]);

  const shown = releases.slice(0, limit);
  return (
    <div className="ver-table ver-rel-list">
      {shown.map((r) => {
        const cur = isCurrent(r);
        const note = noteFor(r.version);
        const lead = note?.title ?? r.notes;
        const hasNotes = !!(note?.highlights.length || note?.body || r.notes);
        const expanded = hasNotes && !collapsed.has(r.version);
        const state = cur
          ? "current"
          : currentVersion && compareVersions(r.version, currentVersion) > 0
            ? "available"
            : "past";
        return (
          <div key={r.version} className={`ver-relrow ${cur ? "is-current" : ""}`}>
            <div
              className={`ver-relrow-head ${hasNotes ? "clickable om-sweep-host" : ""}`}
              onClick={() => hasNotes && toggle(r.version)}
            >
              <div className="flex-min">
                <div className="ver-ver-line">
                  <span className="ver-ver-num">
                    <span className="om-sweep">{r.version}</span>
                  </span>
                  <span className={`ver-state ${state}`}>{STATE_LABEL[state]}</span>
                </div>
                {lead && <div className="ver-rellead">{lead}</div>}
              </div>
              <div className="ver-relrow-right" onClick={(e) => e.stopPropagation()}>
                <span className="ver-reldate">
                  {r.created_at || note?.releaseDate
                    ? new Date(r.created_at ?? note!.releaseDate!).toLocaleDateString()
                    : "—"}
                </span>
                {action(r, cur)}
                {/* The chevron is the accordion's REAL control (a native <button>, so
                    Enter/Espace work for free) — the row-head onClick stays as a wider
                    mouse target only. It cannot itself be a <button>: the right column
                    nests the action button. */}
                {hasNotes && (
                  <button
                    type="button"
                    className={`ver-relchev${expanded ? " open" : ""}`}
                    onClick={() => toggle(r.version)}
                    aria-expanded={expanded}
                    aria-label={`${expanded ? "Replier" : "Déplier"} les notes de la version ${r.version}`}
                  >
                    <ChevDownIcon size={16} />
                  </button>
                )}
              </div>
            </div>
            {expanded && <ReleaseNoteBody note={note} fallback={r.notes ?? undefined} />}
          </div>
        );
      })}
      {releases.length > limit && (
        <div ref={sentinelRef} className="ver-rel-loader">
          <BrandLoader size={22} mono />
        </div>
      )}
    </div>
  );
}
