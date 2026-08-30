import { useState } from "react";
import { ModalShell } from "./ModalShell";
import { GUIDE, HELP_CENTER_URL, sectionGuides } from "../../help";
import { useT } from "../../i18n";
import { ArrowRightIcon, HelpIcon } from "../../components/brand";
import { RedactionDemo } from "../../components/RedactionDemo";
import { useReleaseNotes } from "../../state/releaseNotes";
import { GuideReleases } from "./GuideReleases";
import { BRAND } from "@openmasq/branding";

/**
 * « Aide » — the app explaining itself, opened from the right rail (and the mobile
 * Réglages). A THEMED two-pane layout: a chapter menu on the left, ONE chapter's content
 * on the right — five themes was past what a single scroll column read well.
 *
 * Every string comes from `help/` — the section chapter renders the SAME sentences the
 * nav tooltips and the page headers use, so the guide cannot describe an app that no
 * longer exists (`guide.test.ts` re-checks its factual claims against the real defaults).
 * On a narrow viewport the menu folds into a horizontal chip row (CSS only).
 */
export function GuideModal({
  onClose,
  initialChapter,
}: {
  onClose: () => void;
  /** Ouvrir sur CE chapitre (ex. `protection` depuis « Comprendre mon redaction »).
   *  Explicite plutôt que « le premier » : l'ordre du guide est éditorial, un appelant
   *  qui compterait dessus casserait au premier réordonnancement. */
  initialChapter?: string;
}) {
  const [active, setActive] = useState(initialChapter ?? GUIDE[0].id);
  const t = useT();
  // ⚠️ Le chapitre « Nouveautés » n'existe que là où les notes existent : sur une
  // plateforme sans relais (aperçu navigateur), un onglet qui ne peut RIEN afficher est
  // pire qu'un onglet absent — il se lit comme une panne de l'app.
  const { unavailable } = useReleaseNotes();
  const chapters = GUIDE.filter((c) => !c.releases || !unavailable);
  const chapter = chapters.find((c) => c.id === active) ?? chapters[0];

  return (
    <ModalShell onClose={onClose} width="min(820px, 94vw)" maxHeight="min(78vh, 720px)">
      <div className="guide-head">
        <span className="guide-head-ic">
          <HelpIcon size={18} />
        </span>
        <div>
          <div className="cv-eyebrow guide-eyebrow">AIDE</div>
          <h2 className="cv-display guide-title">Prendre en main {BRAND.name}</h2>
        </div>
        {/* Le centre d'aide étendu. `target="_blank"` est la sortie vers le navigateur
            SYSTÈME (le processus principal la filtre par schéma) — jamais le navigateur
            agent, qui est un outil du modèle, pas une visionneuse de documentation. */}
        <a
          className="btn-primary guide-head-cta"
          href={HELP_CENTER_URL}
          target="_blank"
          rel="noreferrer noopener"
        >
          <span>Centre d&apos;aide complet</span>
          <ArrowRightIcon size={15} />
        </a>
      </div>

      <div className="guide-layout">
        <nav className="guide-nav" aria-label="Thèmes du guide">
          {chapters.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`guide-nav-item${c.id === active ? " on" : ""}`}
              aria-current={c.id === active}
              onClick={() => setActive(c.id)}
            >
              {c.title}
            </button>
          ))}
        </nav>

        <div className="guide-body" key={chapter.id}>
          <section className="guide-chapter">
            <h3 className="guide-chapter-title">{chapter.title}</h3>
            <p className="guide-lead">{chapter.lead}</p>

            {/* La démonstration du premier lancement, à demeure : c'est l'explication la
                plus claire du produit, et elle disparaissait avec l'accueil. Même
                composant, donc les deux ne peuvent pas raconter deux produits. */}
            {chapter.demo && <RedactionDemo />}


            {chapter.points && (
              <ul className="guide-points">
                {chapter.points.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}

            {/* L'historique publié — un drapeau dans `help/`, le contenu ici : `help/`
                reste du texte, et c'est le guide qui monte ce qui vient du réseau. APRÈS
                les points : la liste fait des dizaines de versions, ce qui les enterrerait. */}
            {chapter.releases && <GuideReleases />}

            {chapter.terms && (
              <dl className="guide-terms">
                {chapter.terms.map((term) => (
                  <div key={term.term} className="guide-term">
                    <dt>{term.term}</dt>
                    <dd>{term.def}</dd>
                  </div>
                ))}
              </dl>
            )}

            {chapter.sections && (
              <dl className="guide-terms">
                {sectionGuides(t).map((s) => (
                  <div key={s.id} className="guide-term">
                    <dt>{s.label}</dt>
                    <dd>{s.guide}</dd>
                  </div>
                ))}
              </dl>
            )}
          </section>
        </div>
      </div>

      <div className="guide-foot">
        {/* Fantôme, pas lime : la marque n'a qu'UN appel à l'action par écran, et sur un
            guide c'est « aller lire plus », pas « fermer ». La sortie reste évidente — la
            croix et le fond cliquable ferment aussi. */}
        <button type="button" className="btn-ghost" onClick={onClose}>
          J&apos;ai compris
        </button>
      </div>
    </ModalShell>
  );
}
