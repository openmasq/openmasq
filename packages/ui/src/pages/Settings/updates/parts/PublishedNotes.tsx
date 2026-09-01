import { useReleaseNotesFeed } from "../../../../state/settings/releaseNotes";
import { ReleaseNotesList } from "../../../../components/releaseNotes";
import { BrandLoader } from "../../../../components/media/BrandLogo";

import { useT } from "../../../../i18n";
/**
 * The PUBLISHED HISTORY in the Versions menu — the versions and what each one brought
 * (Contentful, via analytics-fn), most recent first.
 *
 * ⚠️ Why it exists when the TECHNICAL view already shows a note under each build:
 * that view only renders on a staging build or for a privileged device
 * (`versionsView.ts`). Everywhere else — i.e. for nearly everyone — the
 * Versions menu said ONLY "the app is up to date", without a single version or a single
 * line of what changed. And "knowing what changed in a tool that touches your
 * data" is exactly what this screen promises.
 *
 * Here we only show what's PUBLISHED: nothing to install, nothing to pin — the list of
 * installable builds stays `ReleaseHistory`, and it only appears where it means something.
 * Rendering a note, though, is shared with the "Nouveautés" tab of the help
 * (`components/releaseNotes`), so a note reads the same in both screens.
 */
export function PublishedNotes() {
  const t = useT();
  const { notes, loading, unavailable } = useReleaseNotesFeed();

  // No source for notes (browser aperçu, relay down): no empty section.
  if (unavailable) return null;

  return (
    <>
      <div className="ver-hist-head">
        <div className="cv-eyebrow ver-eyebrow">{t.versionsTab.publishedEyebrow}</div>
      </div>
      {loading ? (
        <div className="rn-loading">
          <BrandLoader size={22} mono />
        </div>
      ) : notes.length === 0 ? (
        // An empty list must be SAID: blank space reads as an app failure, and nothing
        // would let you know whether it's the app or the team that published nothing.
        <div className="ver-table ver-empty">{t.versionsTab.noPublished}</div>
      ) : (
        <ReleaseNotesList notes={notes} />
      )}
    </>
  );
}
