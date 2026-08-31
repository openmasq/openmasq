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
 * COMMENT SE LIT UNE NOTE DE VERSION — une seule fois, pour les deux surfaces qui en
 * montrent : l'historique des builds (Réglages → Versions) et l'onglet « Nouveautés » de
 * l'AIDE. Promu ici le jour où la seconde est apparue : jusque-là il vivait, privé, dans
 * `pages/Settings/updates/ReleaseHistory.tsx`.
 *
 * Feuille PURE : les notes arrivent en props, rien n'est chargé ici (le cache et son
 * préchargement sont `state/releaseNotes.ts` + `state/settingsPrefetch.ts`).
 */

/** Les puces d'une note, rangées dans les trois groupes colorés du design system
 *  (Nouveautés / Améliorations / Corrections), plus son corps markdown. `fallback` est
 *  la note brute du manifeste de build, quand Contentful n'en a pas. */
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
 * L'HISTORIQUE PUBLIÉ, tel qu'il est écrit — version, date, titre, puis les puces.
 *
 * ⚠️ Ce n'est PAS la liste des builds installables (celle-là vit dans Réglages → Versions
 * et parle d'installer, d'épingler, de revenir en arrière). Ici on ne montre que ce que
 * l'équipe a publié : rien à cliquer, rien à décider — on vient lire ce qui a changé.
 * Une note sans aucune puce ni corps garde sa ligne : sa date et son titre disent déjà
 * quelque chose, et un trou dans une chronologie se lit comme une panne.
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
