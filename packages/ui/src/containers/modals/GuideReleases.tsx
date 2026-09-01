import { useReleaseNotesFeed } from "../../state/settings/releaseNotes";
import { ReleaseNotesList } from "../../components/releaseNotes";
import { BrandLoader } from "../../components/media/BrandLogo";

import { useT } from "../../i18n";
/**
 * The « Nouveautés » tab of HELP: the published history.
 *
 * ⚠️ It TRIGGERS the load, it doesn't just read — hence `useReleaseNotesFeed`
 * rather than `useReleaseNotes`. The notes preload happens on arrival in
 * Settings; but help opens from the rail, without ever passing through Settings.
 */
export function GuideReleases() {
  const t = useT();
  const { notes, loading, unavailable } = useReleaseNotesFeed();

  if (unavailable) return null; // the guide already hides the chapter — belt and braces
  if (loading) {
    return (
      <div className="rn-loading">
        <BrandLoader size={22} mono />
      </div>
    );
  }
  // An empty list SAYS so. A chapter that opens onto nothing reads like an outage, and
  // the user has no way to know whether it's the app or the team that said nothing.
  if (notes.length === 0) {
    return <p className="guide-lead">{t.modals.guide.noReleases}</p>;
  }
  return <ReleaseNotesList notes={notes} />;
}
