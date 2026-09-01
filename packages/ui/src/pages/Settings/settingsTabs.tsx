import type { ReactNode } from "react";
import {
  ActivityIcon,
  BrowserIcon,
  CardIcon,
  GridIcon,
  LayersIcon,
  RefreshIcon,
  ShieldIcon,
  UserIcon,
  UsersIcon,
  ZapIcon,
} from "../../components/brand";
import { useHost, type OrgProfileInfo } from "../../host";
import type { Messages } from "@openmasq/i18n";
import { useT } from "../../i18n";
import { tabAvailable, type SettingsCapabilities, type SettingsTabId as TabId } from "./settingsIndex";

/**
 * The settings tab set — the ONE list both presentations walk: the desktop icon rail and
 * the mobile grouped root list. Only the ICONS live here; every label/description comes
 * from `settingsIndex.ts` (rule 9: the ⌘K palette names a tab from the same place).
 */
/**
 * `main` is what a rail shows by default; `advanced` sits behind one « Avancé » toggle.
 *
 * The split is not by importance but by ANSWERABILITY: a `main` tab answers « où je règle
 * ceci ? », an `advanced` one is either a read-only VIEW (Audit, Usage, Versions — nothing
 * to set) or a capability most accounts never touch. Eleven equal entries made the four
 * that matter as hard to find as the seven that don't; ⌘K reaches every one of them
 * either way (`searchSettings`).
 */
export type SettingsGroup = "main" | "advanced";

/**
 * The ICON and the GROUP of each tab, in rail order. The LABEL is not here: it lives in
 * the catalogue with the title and the sentence of the same tab (`settingsIndex.ts` →
 * `settings.tabs`), otherwise the rail and the header would name the tab twice — and a
 * translation would fix only one of them.
 */
const SETTINGS_NAV_SHAPE: { id: TabId; icon: ReactNode; group: SettingsGroup }[] = [
  { id: "account", icon: <UserIcon size={19} />, group: "main" },
  { id: "privacy", icon: <ShieldIcon size={19} />, group: "main" },
  { id: "models", icon: <ZapIcon size={19} />, group: "main" },
  { id: "mcp", icon: <GridIcon size={19} />, group: "main" },
  { id: "billing", icon: <CardIcon size={19} />, group: "advanced" },
  { id: "usage", icon: <ActivityIcon size={19} />, group: "advanced" },
  { id: "audit", icon: <ShieldIcon size={19} />, group: "advanced" },
  { id: "browser", icon: <BrowserIcon size={19} />, group: "advanced" },
  { id: "sync", icon: <RefreshIcon size={19} />, group: "advanced" },
  { id: "org", icon: <UsersIcon size={19} />, group: "advanced" },
  { id: "versions", icon: <LayersIcon size={19} />, group: "advanced" },
];

/** The settings rail in `t`'s language — shape + label reunited. */
export function settingsNav(t: Messages): { id: TabId; label: string; icon: ReactNode; group: SettingsGroup }[] {
  return SETTINGS_NAV_SHAPE.map((n) => ({ ...n, label: t.settings.tabs[n.id].label }));
}

/**
 * The capabilities of THIS instance, read from the host. A missing slot = the build did
 * not receive the service's address (or the platform cannot do it): the private `infra`
 * repo. Exposed so the ⌘K palette asks the same question as the rail, without copying it.
 */
export function useSettingsCapabilities(orgProfile?: OrgProfileInfo | null): SettingsCapabilities {
  const host = useHost();
  return {
    org: !!orgProfile,
    sync: !!host.sync,
    browser: !!host.browser,
    billing: !!host.billing,
  };
}

/**
 * The tab set of THIS build. Visibility is a question of CAPABILITY, never of platform —
 * and the rule itself lives in `settingsIndex.ts` (`tabAvailable`), so that the ⌘K palette
 * cannot offer a destination this rail does not have.
 */
export function useVisibleSettingsTabs(orgProfile?: OrgProfileInfo | null) {
  const caps = useSettingsCapabilities(orgProfile);
  return settingsNav(useT()).filter((n) => tabAvailable(n.id, caps));
}
