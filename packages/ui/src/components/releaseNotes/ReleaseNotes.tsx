import { Markdown } from "../markdown/Markdown";
import { useT } from "../../i18n";
import {
  releaseDate,
  groupHighlights,
  latestPerVersion,
  splitHighlight,
  type ReleaseNote,
} from "../../state/releaseNotes";

/**
 * HOW A RELEASE NOTE IS READ — once, for the two surfaces that
 * show them: the build history (Réglages → Versions) and the « Nouveautés » tab of
 * HELP. Promoted here the day the second one appeared: until then it lived, private, in
 * `pages/Settings/updates/ReleaseHistory.tsx`.
 *
 * PURE sheet: the notes arrive as props, nothing is loaded here (the cache and its
 * prefetch are `state/releaseNotes.ts` + `state/settingsPrefetch.ts`).
 */

/** A note's bullets, sorted into the design system's three coloured groups
 *  (Nouveautés / Améliorations / Corrections), plus its markdown body. `fallback` is
 *  the raw note from the build manifest, when Contentful has none. */
export function ReleaseNoteBody({ note, fallback }: { note?: ReleaseNote; fallback?: string }) {
  const t = useT();
  const groups = note ? groupHighlights(note.highlights, t) : [];
  if (note && (groups.length > 0 || note.body)) {
    return (
      <div className="ver-relnotes">
        {groups.map((g) => (
          <div className="ver-relgroup" key={g.key}>
            <div className="ver-relgroup-head">
              <span className={`ver-reldot ${g.tone}`} aria-hidden /> {g.label}
            </div>
            <ul className="ver-rellist">
              {g.items.map((h, i) => {
                const { title, body } = splitHighlight(h);
                return (
                  <li key={i}>
                    <span className="ver-relbullet" aria-hidden />
                    <span>
                      <span className="font-semibold text-strong">{title}</span>
                      {body && <span className="text-body"> — {body}</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        {note.body && (
          <div className="ver-relbody">
            <Markdown content={note.body} />
          </div>
        )}
      </div>
    );
  }
  return fallback ? <div className="ver-relnotes ver-relnotes-plain">{fallback}</div> : null;
}

/**
 * THE PUBLISHED HISTORY, exactly as written — version, date, title, then the bullets.
 *
 * ⚠️ This is NOT the list of installable builds (that one lives in Réglages → Versions
 * and talks about installing, pinning, rolling back). Here we only show what
 * the team has published: nothing to click, nothing to decide — one comes to read what changed.
 * A note with no bullet or body at all keeps its row: its date and title already say
 * something, and a hole in a timeline reads as an outage.
 */
export function ReleaseNotesList({ notes }: { notes: readonly ReleaseNote[] }) {
  const t = useT();
  return (
    <div className="rn-list">
      {latestPerVersion(notes).map((n) => (
        <article className="rn-item" key={`${n.version}-${n.releaseDate ?? ""}`}>
          <header className="rn-item-head">
            <span className="rn-version">{n.version}</span>
            {n.releaseDate && <span className="rn-date">{releaseDate(n.releaseDate, t)}</span>}
          </header>
          {n.title && <h4 className="rn-title">{n.title}</h4>}
          <ReleaseNoteBody note={n} />
        </article>
      ))}
    </div>
  );
}
