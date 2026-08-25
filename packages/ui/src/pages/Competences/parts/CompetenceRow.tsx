import type { KeyboardEvent, MouseEvent } from "react";
import type { Competence } from "../../../types";
import { competenceCategory } from "../../../competences/competences";
import { ArrowRightIcon, SendIcon } from "../../../components/brand";
import { ScopeBadge } from "../../../components/brand/ScopeBadge";

/**
 * Une compétence en RANGÉE — la même que `CompetenceCard`, dense.
 *
 * Ce qui reste et ce qui part, et pourquoi : le nom, la catégorie et « Utiliser » restent
 * (c'est ce pour quoi on vient) ; la description tombe à UNE ligne au lieu de trois — en
 * rangée, la troisième ligne coûte le gain de densité qu'on est venu chercher.
 *
 * Les mêmes deux règles d'interaction que la carte, pour la même raison : les boutons
 * imbriqués coupent la propagation, et le clavier ne déclenche l'édition QUE si la touche
 * a atterri sur la rangée elle-même. Sans ça, Entrée sur l'épingle épinglerait ET ouvrirait
 * l'éditeur.
 */
export function CompetenceRow({
  competence,
  selected,
  onEdit,
  onUse,
  onTogglePin,
  scope,
  onShare,
}: {
  competence: Competence;
  selected?: boolean;
  onEdit: () => void;
  onUse: () => void;
  /** Absent = no pin affordance (a SHARED compétence — pinning is a personal
   *  ordering gesture, meaningless on someone else's copy). */
  onTogglePin?: () => void;
  /** Sharing scope badge (kit): shown when an org exists. */
  scope?: string;
  /** Opens the « Partager » dialog for THIS compétence (personal rows only). */
  onShare?: () => void;
}) {
  const cat = competenceCategory(competence.cat);
  const name = competence.name || "Sans titre";
  const stop = (e: MouseEvent, run: () => void) => {
    e.stopPropagation();
    run();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    onEdit();
  };

  return (
    <div
      className={`om-row${selected ? " is-selected" : ""}`}
      role="button"
      tabIndex={0}
      aria-label={`Modifier la compétence ${name}`}
      onClick={onEdit}
      onKeyDown={onKeyDown}
    >
      <span className="om-row-mark" title={cat.label}>
        {cat.glyph}
      </span>
      <span className="om-row-main">
        <span className="om-row-name">{name}</span>
        <span className="om-row-sub">{competence.desc || cat.label}</span>
      </span>
      {scope && <ScopeBadge scope={scope} />}
      <span className="om-row-meta">{competence.uses ?? 0}×</span>
      <span className="om-row-actions">
        {onShare && (
          <button
            type="button"
            className="om-skill-share"
            onClick={(e) => stop(e, onShare)}
            title="Partager cette compétence"
          >
            <ArrowRightIcon size={12} /> Partager
          </button>
        )}
        {onTogglePin && (
          <button
            type="button"
            className={`om-skill-pin${competence.pinned ? " on" : ""}`}
            onClick={(e) => stop(e, onTogglePin)}
            aria-pressed={!!competence.pinned}
            title={competence.pinned ? "Retirer de la barre latérale" : "Épingler dans la barre latérale"}
          >
            {competence.pinned ? "★" : "☆"}
          </button>
        )}
        <button
          type="button"
          className="om-skill-use"
          onClick={(e) => stop(e, onUse)}
          title="Insérer dans la conversation"
          aria-label={`Utiliser ${name}`}
        >
          <SendIcon size={13} />
        </button>
      </span>
    </div>
  );
}
