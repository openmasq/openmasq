import { ShieldIcon, ActivityIcon, EyeIcon, TrashIcon } from "../../components/brand";
import type { Settings } from "../../types";
import { useT } from "../../i18n";

/**
 * The chat top bar's ⋯ dropdown — extracted from `ChatHeader` (rule 1). Pure
 * presentation: every action is a callback the header owns (it keeps the modal
 * state and the outside-click/Escape closing logic on its `menu-anchor`).
 */
export function HeaderMenu({
  protectedCount,
  settings,
  onOpenRules,
  onOpenTransparency,
  onOpenDebug,
  onAskDelete,
}: {
  protectedCount: number;
  settings?: Settings;
  onOpenRules: () => void;
  /** Le comparatif côte à côte. Toujours offert : l'encart qui l'annonce ne se montre
   *  qu'une fois, donc c'est ici que la preuve reste atteignable ensuite. */
  onOpenTransparency: () => void;
  onOpenDebug: () => void;
  onAskDelete?: () => void;
}) {
  const t = useT();
  return (
    <div className="header-menu">
      {/* The kit moved the toolbar's standalone shield pill in here: the count is a
          STATUS, not an action you reach for, and the toolbar reads cleaner without
          it. Same target as the old pill — the per-conversation redaction rules, which
          now lead with the SAME three levels as Réglages → Confidentialité. */}
      <button className="header-menu-item" onClick={onOpenRules}>
        <ShieldIcon size={15} />
        {t.chat.redactionSummary(protectedCount)}
      </button>
      <button className="header-menu-item" onClick={onOpenTransparency}>
        <EyeIcon size={15} />
        {t.chat.seeWhatTheModelSaw}
      </button>
      {/* Le TOGGLE est la porte (Réglages → Confidentialité → « Journal technique
          détaillé ») : l'activer est l'acte volontaire, et le journal ne contient que
          des données que ce renderer tient déjà. L'ex-condition « compte interne »
          (email d'équipe) ne protégeait rien par design — et a fini par bloquer
          l'équipe elle-même sur staging, connectée avec un autre compte. Un réglage
          qui capture sans AUCUNE surface pour lire serait pire qu'aucun réglage. */}
      {settings?.debugLog && (
        <button className="header-menu-item" onClick={onOpenDebug}>
          <ActivityIcon size={15} />
          {t.chat.debugLog}
        </button>
      )}
      {onAskDelete && (
        <button className="header-menu-item danger" onClick={onAskDelete}>
          <TrashIcon size={15} />
          {t.chrome.deleteConversationAction}
        </button>
      )}
    </div>
  );
}
