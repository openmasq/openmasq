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
import type { SettingsTabId as TabId } from "./settingsIndex";

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
 * Capability-gated tab set. Visibility is a CAPABILITY question, never a platform one —
 * "Navigateur" needs the integrated browser, "Synchro" the sync host slot, "Organisation"
 * an org membership. `AppShell` applies the same gates to the ⌘K palette, so the palette
 * can never offer a tab this list doesn't have.
 */
export function useVisibleSettingsTabs(orgProfile?: OrgProfileInfo | null) {
  const host = useHost();
  return SETTINGS_NAV.filter(
    (t) =>
      (t.id !== "org" || !!orgProfile) &&
      (t.id !== "sync" || !!host.sync) &&
      (t.id !== "browser" || !!host.browser),
  );
}
