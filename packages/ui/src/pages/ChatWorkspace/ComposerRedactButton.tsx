import { createPortal } from "react-dom";
import { useT } from "../../i18n";
import { IconButton, LevelsIcon } from "../../components/brand";
import { usePopover } from "../../hooks/usePopover";
import { ComposerRedactMenu, type RedactLevelApi } from "./ComposerRedactMenu";

/**
 * Le bouton « niveau de redaction » de la rangée d'action, et son popover.
 *
 * À part de `Composer` (déjà en dette de taille) parce que c'est un contrôle entier —
 * déclencheur, ancrage, portail — et qu'il n'a besoin de rien d'autre que son api.
 *
 * ⚠️ **PORTALÉ et ancré, jamais `absolute`.** C'est l'avertissement que porte déjà
 * `HueSelect`, et il vaut ici pour deux raisons mesurées dans l'app construite : le
 * composeur vit dans des ancêtres à `overflow`, qui CLIPPENT un menu en flux ; et les trois
 * cartes — avec la contrepartie que la règle 8 impose à chacune — sont plus hautes que la
 * place au-dessus du composeur sur l'écran d'accueil, si bien qu'en `absolute` le haut du
 * menu sortait de la fenêtre en emportant l'intitulé et la première carte. `clampHeight`
 * borne à la place RÉELLE, et `usePopover` retourne le menu sous le bouton quand il le faut.
 */
export function ComposerRedactButton({ api }: { api: RedactLevelApi }) {
  const t = useT();
  const pop = usePopover<HTMLDivElement, HTMLDivElement>({
    anchor: { gap: 8, width: 386, desiredHeight: 280, clampHeight: true, minHeight: 180 },
  });
  return (
    <div className="composer-redact-wrap" ref={pop.triggerRef}>
      <IconButton
        size="sm"
        label={t.composer.redactLevel}
        active={pop.open}
        expanded={pop.open}
        haspopup="menu"
        onClick={pop.toggle}
      >
        <LevelsIcon size={16} bars={api.bars} />
      </IconButton>
      {pop.open &&
        pop.style &&
        createPortal(
          <div ref={pop.menuRef} className="crm-pop" style={pop.style}>
            <ComposerRedactMenu api={api} onDone={pop.close} />
          </div>,
          document.body,
        )}
    </div>
  );
}
