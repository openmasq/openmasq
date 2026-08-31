import { TilesIcon, RowsIcon } from "./brand";
import type { ViewMode } from "../hooks/useViewMode";

import { useT } from "../i18n";
const MODES: { id: ViewMode; icon: (p: { size?: number }) => JSX.Element }[] = [
  { id: "grid", icon: TilesIcon },
  { id: "list", icon: RowsIcon },
];

/**
 * Grille ⇄ liste, la MÊME commande sur les trois écrans qui listent des objets
 * (Bibliothèque, Compétences, Workflows).
 *
 * Une seule maison (règle 9) : trois copies auraient dérivé sur l'ordre des boutons, la
 * taille de l'icône et le mot employé — et un mode d'affichage se reconnaît justement au
 * fait qu'il est au même endroit partout.
 *
 * `radiogroup` et non deux bascules : les deux modes sont exclusifs, et un lecteur d'écran
 * doit entendre « 1 sur 2 », pas deux interrupteurs indépendants dont l'un serait
 * redondant. Le libellé reste dans `title`/`aria-label` — à cette densité, un mot par
 * bouton coûterait la place qu'on cherche justement à rendre.
 */
export function ViewModeToggle({
  mode,
  onChange,
  className = "",
}: {
  mode: ViewMode;
  onChange: (m: ViewMode) => void;
  className?: string;
}) {
  const t = useT();
  return (
    <div className={`om-viewmode ${className}`.trim()} role="radiogroup" aria-label={t.leaves.display}>
      {MODES.map(({ id, icon: Glyph }) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={mode === id}
          aria-label={id === "grid" ? t.leaves.viewGrid : t.leaves.viewList}
          title={id === "grid" ? t.leaves.viewGrid : t.leaves.viewList}
          className={`om-viewmode-btn${mode === id ? " active" : ""}`}
          onClick={() => onChange(id)}
        >
          <Glyph size={15} />
        </button>
      ))}
    </div>
  );
}
