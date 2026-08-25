import type { BannerTone } from "../../components/feedback/bannerTones";
import type { McpReconnectItem } from "../../hooks/useMcpReconnect";
import { BRAND } from "@openmasq/branding";

/**
 * Ce que le shell annonce en permanence, et dans quel ORDRE — pur, donc testable.
 *
 * Trois états peuvent coexister ; une seule pastille s'affiche, la plus grave
 * d'abord : une panne de réseau explique déjà un connecteur tombé, et parler
 * d'abonnement à quelqu'un qui est hors ligne est hors sujet. `ShellChrome` ne
 * fait que rendre ce que cette fonction choisit et brancher les gestes.
 */
export type ShellNoticeKind = "offline" | "mcp" | "access";

export interface ShellNotice {
  kind: ShellNoticeKind;
  tone: BannerTone;
  /** Le seul texte visible replié : il doit suffire à comprendre l'état. */
  title: string;
  message: string;
  actionLabel?: string;
  /** Une PANNE ne se masque pas : elle disparaît quand elle est finie. */
  dismissible: boolean;
}

export function pickShellNotice(input: {
  reconnecting: boolean;
  mcpItems: McpReconnectItem[];
  showAccess: boolean;
}): ShellNotice | null {
  if (input.reconnecting) {
    return {
      kind: "offline",
      tone: "warning",
      title: "Hors ligne",
      message:
        `Connexion à ${BRAND.name} perdue. Vos conversations restent accessibles — reconnexion automatique en cours…`,
      dismissible: false,
    };
  }
  const items = input.mcpItems;
  if (items.length > 0) {
    return {
      kind: "mcp",
      tone: "warning",
      title:
        items.length === 1
          ? `Reconnexion nécessaire : ${items[0].name}`
          : `Reconnexion nécessaire : ${items.length} connecteurs`,
      message:
        items.length === 1
          ? "La connexion à ce connecteur a été perdue. Reconnectez-le depuis les réglages."
          : `Connexions perdues : ${items.map((i) => i.name).join(", ")}.`,
      actionLabel: "Reconnecter",
      dismissible: true,
    };
  }
  if (input.showAccess) {
    return {
      kind: "access",
      tone: "info",
      title: "Vous utilisez les modèles gratuits",
      message:
        `Pour ouvrir tout le catalogue : un abonnement ${BRAND.name}, ou votre propre clé chez un fournisseur.`,
      actionLabel: "Voir mes accès",
      dismissible: true,
    };
  }
  return null;
}
