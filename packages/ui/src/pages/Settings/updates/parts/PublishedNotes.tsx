import { useReleaseNotesFeed } from "../../../../state/releaseNotes";
import { ReleaseNotesList } from "../../../../components/releaseNotes";
import { BrandLoader } from "../../../../components/media/BrandLogo";

import { useT } from "../../../../i18n";
/**
 * L'HISTORIQUE PUBLIÉ dans le menu Versions — les versions et ce que chacune a apporté
 * (Contentful, via analytics-fn), la plus récente en tête.
 *
 * ⚠️ Pourquoi il existe alors que la vue TECHNIQUE montre déjà une note sous chaque build :
 * cette vue-là n'est rendue que sur une build de staging ou pour un appareil privilégié
 * (`versionsView.ts`). Partout ailleurs — c'est-à-dire chez la quasi-totalité des gens — le
 * menu Versions ne disait QUE « l'app est à jour », sans une seule version ni une seule
 * ligne de ce qui a changé. Or « savoir ce qui a changé dans un outil qui touche à vos
 * données » est exactement ce que cet écran promet.
 *
 * Ici on ne montre que le PUBLIÉ : rien à installer, rien à épingler — la liste des builds
 * installables reste `ReleaseHistory`, et elle n'apparaît que là où elle veut dire quelque
 * chose. Le rendu d'une note, lui, est partagé avec l'onglet « Nouveautés » de l'aide
 * (`components/releaseNotes`), donc une note se lit pareil dans les deux écrans.
 */
export function PublishedNotes() {
  const t = useT();
  const { notes, loading, unavailable } = useReleaseNotesFeed();

  // Pas de source de notes (aperçu navigateur, relais coupé) : pas de section vide.
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
        // Une liste vide se DIT : un espace blanc se lit comme une panne de l'app, et rien
        // ne permettrait de savoir si c'est elle ou l'équipe qui n'a rien publié.
        <div className="ver-table ver-empty">{t.versionsTab.noPublished}</div>
      ) : (
        <ReleaseNotesList notes={notes} />
      )}
    </>
  );
}
