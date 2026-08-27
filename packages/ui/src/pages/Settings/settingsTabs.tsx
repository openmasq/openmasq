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

export const SETTINGS_NAV: { id: TabId; label: string; icon: ReactNode; group: SettingsGroup }[] = [
  { id: "account", label: "Compte", icon: <UserIcon size={19} />, group: "main" },
  { id: "privacy", label: "Confidentialité", icon: <ShieldIcon size={19} />, group: "main" },
  { id: "models", label: "Modèles", icon: <ZapIcon size={19} />, group: "main" },
  { id: "mcp", label: "Connecteurs", icon: <GridIcon size={19} />, group: "main" },
  { id: "billing", label: "Paiement", icon: <CardIcon size={19} />, group: "advanced" },
  { id: "usage", label: "Usage", icon: <ActivityIcon size={19} />, group: "advanced" },
  { id: "audit", label: "Journal", icon: <ShieldIcon size={19} />, group: "advanced" },
  { id: "browser", label: "Navigateur", icon: <BrowserIcon size={19} />, group: "advanced" },
  { id: "sync", label: "Vos appareils", icon: <RefreshIcon size={19} />, group: "advanced" },
  { id: "org", label: "Organisation", icon: <UsersIcon size={19} />, group: "advanced" },
  { id: "versions", label: "Versions", icon: <LayersIcon size={19} />, group: "advanced" },
];

/**
 * Les capacités de CETTE instance, lues sur l'hôte. Un créneau absent = le build n'a pas
 * reçu l'adresse du service (ou la plateforme ne sait pas le faire) : `SELF_HOSTING.md`.
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
  return SETTINGS_NAV.filter((t) => tabAvailable(t.id, caps));
}
