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
      message: t.shell.notice.offlineBody(BRAND.name),
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
          ? t.shell.notice.reconnectOne(items[0].name)
          : t.shell.notice.reconnectMany(items.length),
      message:
        items.length === 1
          ? t.shell.notice.reconnectOneBody
          : t.shell.notice.reconnectManyBody(items.map((i) => i.name).join(", ")),
      actionLabel: t.shell.notice.reconnect,
      dismissible: true,
    };
  }
  if (input.showAccess) {
    return {
      kind: "access",
      tone: "info",
      title: t.leaves.freeModelsNotice,
      message: subscriptionsSold()
        ? t.shell.notice.accessBodySold(BRAND.name)
        : t.shell.notice.accessBody,
      actionLabel: t.shell.notice.seeAccess,
      dismissible: true,
    };
  }
  return null;
}
