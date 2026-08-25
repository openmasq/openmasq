import { useReleaseNotesFeed } from "../../state/releaseNotes";
import { ReleaseNotesList } from "../../components/releaseNotes";
import { BrandLoader } from "../../components/media/BrandLogo";

/**
 * L'onglet « Nouveautés » de l'AIDE : l'historique publié.
 *
 * ⚠️ Il DÉCLENCHE le chargement, il ne se contente pas de lire — d'où `useReleaseNotesFeed`
 * plutôt que `useReleaseNotes`. Le préchargement des notes se fait à l'arrivée dans
 * Réglages ; or on ouvre l'aide depuis le rail, sans être jamais passé par Réglages.
 */
export function GuideReleases() {
  const { notes, loading, unavailable } = useReleaseNotesFeed();

  if (unavailable) return null; // le guide masque déjà le chapitre — ceinture et bretelles
  if (loading) {
    return (
      <div className="rn-loading">
        <BrandLoader size={22} mono />
      </div>
    );
  }
  // Une liste vide se DIT. Un chapitre qui s'ouvre sur rien se lit comme une panne, et
  // l'utilisateur n'a aucun moyen de savoir si c'est l'app ou l'équipe qui n'a rien dit.
  if (notes.length === 0) {
    return <p className="guide-lead">Aucune note de version publiée pour le moment.</p>;
  }
  return <ReleaseNotesList notes={notes} />;
}
