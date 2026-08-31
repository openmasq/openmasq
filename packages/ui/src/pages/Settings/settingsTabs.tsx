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
 * L'ICÔNE et le GROUPE de chaque onglet, en ordre de rail. L'ÉTIQUETTE n'est pas ici : elle
 * vit dans le catalogue avec le titre et la phrase du même onglet (`settingsIndex.ts` →
 * `settings.tabs`), sinon le rail et l'en-tête nommeraient l'onglet deux fois — et une
 * traduction n'en corrigerait qu'un.
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
 * Les capacités de CETTE instance, lues sur l'hôte. Un créneau absent = le build n'a pas
 * reçu l'adresse du service (ou la plateforme ne sait pas le faire) : le dépôt privé `infra`.
 * Exposé pour que la palette ⌘K pose la même question que le rail, sans la recopier.
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
 * L'ensemble d'onglets de CE build. La visibilité est une question de CAPACITÉ, jamais de
 * plateforme — et la règle elle-même vit dans `settingsIndex.ts` (`tabAvailable`), pour
 * que la palette ⌘K ne puisse pas offrir une destination que ce rail n'a pas.
 */
export function useVisibleSettingsTabs(orgProfile?: OrgProfileInfo | null) {
  const caps = useSettingsCapabilities(orgProfile);
  return settingsNav(useT()).filter((n) => tabAvailable(n.id, caps));
}
