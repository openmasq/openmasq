import type { Messages } from "@openmasq/i18n";
import type { BannerTone } from "../../components/feedback/bannerTones";
import type { McpReconnectItem } from "../../hooks/useMcpReconnect";
import { BRAND } from "@openmasq/branding";
import { subscriptionsSold } from "../../send/platformAccess";

/**
 * What the shell announces at all times, and in what ORDER — pure, hence testable.
 *
 * Three states can coexist; only one badge is shown, the most serious
 * first: a network outage already explains a downed connector, and talking
 * about a subscription to someone who is offline is beside the point. `ShellChrome`
 * only renders what this function picks and wires up the actions.
 */
export type ShellNoticeKind = "offline" | "mcp" | "access";

export interface ShellNotice {
  kind: ShellNoticeKind;
  tone: BannerTone;
  /** The only text visible when collapsed: it must be enough to understand the state. */
  title: string;
  message: string;
  actionLabel?: string;
  /** An OUTAGE cannot be dismissed: it disappears when it's over. */
  dismissible: boolean;
}

export function pickShellNotice(
  input: {
    reconnecting: boolean;
    mcpItems: McpReconnectItem[];
    showAccess: boolean;
  },
  t: Messages,
): ShellNotice | null {
  if (input.reconnecting) {
    return {
      kind: "offline",
      tone: "warning",
      title: t.leaves.offline,
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
      title: t.leaves.freeModelsNotice,
      message: subscriptionsSold()
        ? `Pour ouvrir tout le catalogue : un abonnement ${BRAND.name}, ou votre propre clé chez un fournisseur.`
        : "Pour ouvrir tout le catalogue : votre propre clé chez un fournisseur.",
      actionLabel: "Voir mes accès",
      dismissible: true,
    };
  }
  return null;
}
