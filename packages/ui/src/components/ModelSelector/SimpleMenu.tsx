import { Fragment, useEffect, useRef, useState } from "react";
import type { ModelInfo } from "@openmasq/llm";
import type { UnavailableReason } from "../../send/modelAvailability";
import { ExpandIcon } from "../brand";
import type { MenuPos } from "./FinderMenu";
import { ModelRow } from "./ModelRow";
import { favoriteSet, simpleMenuModels, simpleMenuSections } from "./simpleList";

import { useT } from "../../i18n";
/**
 * La vue SIMPLIFIÉE du sélecteur : une liste courte, pas un navigateur. Pas de colonnes,
 * pas de recherche, pas de filtres de prix — sur cinq entrées, chacun de ces outils coûte
 * plus d'attention qu'il n'en fait gagner.
 *
 * Elle n'est pas un mode dégradé : « Tous les modèles » est visible en permanence, en
 * bas, et bascule sans fermer le menu. Un choix qu'on ne peut pas défaire d'un clic n'est
 * pas une simplification, c'est un mur.
 */
export function SimpleMenu({
  value,
  available,
  unavailableModels,
  favorites,
  onToggleFavorite,
  defaultModelId,
  onSetDefault,
  pos,
  onChoose,
  onClose,
  onAccessInfo,
  onShowAll,
}: {
  value: string;
  available: ModelInfo[];
  unavailableModels?: ReadonlyMap<string, UnavailableReason>;
  /** Favoris de l'utilisateur (`Settings.favoriteModels`) — vide ⇒ le défaut catalogue. */
  favorites?: readonly string[];
  /** Épingler/retirer un modèle. Absent ⇒ pas d'étoile. */
  onToggleFavorite?: (id: string) => void;
  /** Le modèle par défaut des nouvelles conversations (`Settings.defaultModelId`). */
  defaultModelId?: string;
  /** En faire le modèle par défaut. Absent ⇒ pas de marqueur maison. */
  onSetDefault?: (id: string) => void;
  pos: MenuPos;
  onChoose: (id: string) => void;
  onClose: () => void;
  onAccessInfo?: (focus: "free" | "credits" | "key", providerLabel?: string) => void;
  /** Passer en vue complète (tous les fournisseurs) — le menu RESTE ouvert. */
  onShowAll: () => void;
}) {
  const t = useT();
  const favSet = favoriteSet(favorites);
  // Les BLOCS décident de l'ordre affiché (le défaut passe en tête) ; `models` en est
  // l'aplatissement, et c'est LUI que le clavier suit — deux ordres, l'un pour l'œil et
  // l'autre pour les flèches, c'est la flèche « bas » qui saute une ligne.
  const sections = simpleMenuSections(simpleMenuModels(available, value, favorites), {
    favSet,
    defaultId: defaultModelId,
  });
  const models = sections.flatMap((s) => s.models);
  const [focusId, setFocusId] = useState(() => (models.some((m) => m.id === value) ? value : models[0]?.id) ?? "");
  const focusRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Le menu prend le focus à l'ouverture : sans ça les flèches défilent la PAGE derrière
  // (il n'y a pas de champ de recherche ici pour l'attraper, contrairement au Finder).
  useEffect(() => {
    rootRef.current?.focus();
  }, []);
  // ⚠️ Pas au PREMIER rendu. Le focus initial est le modèle courant, qui peut être la
  // dernière ligne (celle ajoutée hors favoris) : y défiler à l'ouverture présentait la
  // liste déjà déroulée, première entrée rognée — on ouvre un menu, on ne reprend pas une
  // navigation. Le défilement ne sert qu'aux flèches.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    focusRef.current?.scrollIntoView({ block: "nearest" });
  }, [focusId]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") return onClose();
    const i = models.findIndex((m) => m.id === focusId);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = e.key === "ArrowDown" ? i + 1 : i - 1;
      const clamped = Math.max(0, Math.min(models.length - 1, next));
      setFocusId(models[clamped]?.id ?? focusId);
      return;
    }
    if (e.key === "Enter" && focusId) {
      e.preventDefault();
      onChoose(focusId);
    }
  };

  return (
    <div
      ref={rootRef}
      className="model-finder simple"
      tabIndex={-1}
      role="listbox"
      aria-label={t.modelPicker.models}
      style={{
        position: "fixed",
        left: pos.left,
        width: Math.min(pos.width, 340),
        maxHeight: pos.maxHeight,
        ...(pos.top != null ? { top: pos.top } : { bottom: pos.bottom }),
      }}
      onKeyDown={onKeyDown}
    >
      <div className="model-simple-list">
        {models.length === 0 && <div className="model-empty">{t.modelPicker.none}</div>}
        {/* Un intitulé par bloc — « ces cinq-là, pourquoi ? ». `simpleMenuSections` les
            compose (et n'en rend aucun de vide) ; la vue ne fait que les dérouler. */}
        {sections.map((sec) => (
          <Fragment key={sec.label}>
            <div className="model-simple-sep">{sec.label}</div>
            {sec.models.map((m) => (
              <ModelRow
                key={m.id}
                ref={m.id === focusId ? focusRef : undefined}
                model={m}
                selected={m.id === value}
                focused={m.id === focusId}
                reason={unavailableModels?.get(m.id)}
                compact
                favorite={favSet.has(m.id)}
                onToggleFavorite={onToggleFavorite}
                isDefault={!!defaultModelId && m.id === defaultModelId}
                onSetDefault={onSetDefault}
                onAccessInfo={onAccessInfo}
                onChoose={onChoose}
                onHover={setFocusId}
              />
            ))}
          </Fragment>
        ))}
      </div>
      <button type="button" className="model-simple-all" onClick={onShowAll}>
        <ExpandIcon size={14} />
        {t.modelPicker.allModels}
      </button>
    </div>
  );
}
