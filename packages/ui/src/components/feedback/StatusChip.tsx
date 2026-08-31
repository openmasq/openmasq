import { useState } from "react";
import { BANNER_ICONS, type BannerAction, type BannerTone } from "./bannerTones";

import { useT } from "../../i18n";
/**
 * La pastille d'ÉTAT — l'avis permanent, dit en un mot.
 *
 * Un état de l'app (hors ligne, connecteur à reconnecter, accès limités) dure : il
 * ne peut donc pas coûter une barre pleine largeur en bas de l'écran, qui couvrait
 * le composeur et toute la partie basse pour une phrase qu'on a lue une fois. Ici :
 * le TITRE seul, dans une pastille de la largeur de son texte, et le message +
 * l'action au clic — repliés par défaut. Le ton réutilise le skin `.kb--<ton>`
 * (une seule table ton→couleur dans le produit).
 *
 * Purement présentationnel : le dock qui la place est `.kchip-dock` (styles/statusChip.css),
 * ce qu'elle annonce est décidé par `containers/shell/shellNotice.ts`.
 */
export interface StatusChipProps {
  tone: BannerTone;
  title: string;
  message?: string;
  action?: BannerAction;
  /** Présent ⇒ la pastille se referme pour de bon. Une PANNE n'en a pas. */
  onClose?: () => void;
}

export function StatusChip({ tone, title, message, action, onClose }: StatusChipProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const hasDetail = !!message || !!action;
  const head = (
    <>
      <span className="kchip-ic">{BANNER_ICONS[tone]}</span>
      <span className="kchip-label">{title}</span>
      {hasDetail && (
        <svg className="kchip-caret" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m18 15-6-6-6 6" />
        </svg>
      )}
    </>
  );
  return (
    <div
      className={`kchip kb--${tone}${open ? " kchip-open" : ""}`}
      // Échap referme le détail — la pastille reste, seul son dépli est transitoire.
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          setOpen(false);
        }
      }}
    >
      <div className="kchip-row">
        {hasDetail ? (
          <button
            type="button"
            className="kchip-head"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            {head}
          </button>
        ) : (
          <div className="kchip-head">{head}</div>
        )}
        {onClose && (
          <button type="button" className="kchip-x" aria-label={t.leaves.hide} onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
      {open && hasDetail && (
        <div className="kchip-detail">
          {message && <p className="kchip-msg">{message}</p>}
          {action && (
            <button type="button" className="kchip-act" onClick={action.onClick}>
              {action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
