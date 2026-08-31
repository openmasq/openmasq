import { useState } from "react";
import { ModalShell } from "./ModalShell";
import { CHAPTER_IDS, guideChapters, HELP_CENTER_URL, sectionGuides } from "../../help";
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
  /** Open on THIS chapter (e.g. `protection` from « Comprendre mon redaction »).
   *  Explicit rather than « the first one »: the guide's order is editorial, a caller
   *  relying on it would break at the first reordering. */
  initialChapter?: string;
}) {
  const [active, setActive] = useState(initialChapter ?? CHAPTER_IDS[0]);
  const t = useT();
  // ⚠️ The « Nouveautés » chapter only exists where the notes exist: on a
  // platform with no relay (browser aperçu), a tab that can display NOTHING is
  // worse than no tab at all — it reads as the app being broken.
  const { unavailable } = useReleaseNotes();
  const chapters = guideChapters(t).filter((c) => !c.releases || !unavailable);
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
        {/* The extended help center. `target="_blank"` is the exit to the SYSTEM
            browser (the main process filters it by scheme) — never the agent
            browser, which is a model tool, not a documentation viewer. */}
        <a
          className="btn-primary guide-head-cta"
          href={HELP_CENTER_URL}
          target="_blank"
          rel="noreferrer noopener"
        >
          <span>{t.modals.guide.helpCenter}</span>
          <ArrowRightIcon size={15} />
        </a>
      </div>

      <div className="guide-layout">
        <nav className="guide-nav" aria-label={t.modals.guide.themes}>
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

            {/* The first-launch demo, kept for good: it's the clearest
                explanation of the product, and it used to disappear with onboarding. Same
                component, so the two can't tell two different stories about the product. */}
            {chapter.demo && <RedactionDemo />}


            {chapter.points && (
              <ul className="guide-points">
                {chapter.points.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}

            {/* The published history — a flag in `help/`, the content here: `help/`
                stays text, and it's the guide that mounts what comes from the network. AFTER
                the points: the list runs to dozens of versions, which would bury them. */}
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
        {/* Ghost, not lime: the brand has only ONE call-to-action per screen, and on a
            guide it's « go read more », not « close ». The exit stays obvious — the
            cross and the clickable background also close it. */}
        <button type="button" className="btn-ghost" onClick={onClose}>
          J&apos;ai compris
        </button>
      </div>
    </ModalShell>
  );
}
