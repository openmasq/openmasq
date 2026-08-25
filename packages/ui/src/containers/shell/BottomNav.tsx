import { MessageIcon, BookIcon, LockIcon, SparklesIcon, MemoryIcon, SettingsIcon } from "../../components/brand";
import { isGated, useFeatureAccess } from "../../state/featureAccess";
import type { Section } from "../../types";
import { useSectionNav } from "./useSectionNav";

/**
 * The mobile bottom tab bar — `AppShell`'s `variant="mobile"` renders this INSTEAD of the
 * desktop icon Rail. It reads/drives the SAME redux `section` (via `useSectionNav`), so all
 * of AppShell's orchestration is reused unchanged; only the nav chrome differs.
 *
 * Chats · Compétences · Mémoire · Coffre · Bibliothèque · Réglages — the section set the
 * `chat-app-mobile` design kit's bottom nav settled on (Chats-first, Réglages-last), and
 * KEEPING **Coffre** (a real privacy surface the kit's nav omitted). **Workflows** keeps no
 * tab of its own (six tabs is the ceiling): the "Compét." slot backs BOTH authoring siblings
 * — it stays highlighted on the `workflows` section, and the screens carry a segmented
 * switch (`mobile/MobileSectionSegments`) to flip between them (kit Workflows screen).
 * There is deliberately NO "Nouveau" tab: new-chat lives in the chat header (`onNewTab`) and
 * the slide-over drawer (`Sidebar` `btn-new`), so a nav slot for it would be a third,
 * redundant entry point.
 */
export function BottomNav() {
  const { section, go } = useSectionNav();
  // Une porte fermée retire son onglet ; la barre se resserre (elle n'a jamais eu
  // de largeur fixe). `state/featureAccess.ts` pour ce que « fermée » veut dire.
  const access = useFeatureAccess();
  const all: { key: Section; label: string; Icon: typeof MessageIcon; on: boolean; act: () => void }[] = [
    { key: "chats", label: "Chats", Icon: MessageIcon, on: section === "chats", act: () => go("chats") },
    { key: "competences", label: "Compét.", Icon: SparklesIcon, on: section === "competences", act: () => go("competences") },
    { key: "memory", label: "Mémoire", Icon: MemoryIcon, on: section === "memory", act: () => go("memory") },
    { key: "vault", label: "Coffre", Icon: LockIcon, on: section === "vault", act: () => go("vault") },
    { key: "library", label: "Biblio", Icon: BookIcon, on: section === "library", act: () => go("library") },
    { key: "settings", label: "Réglages", Icon: SettingsIcon, on: section === "settings", act: () => go("settings") },
  ];
  const items = all.filter((i) => !isGated(i.key) || access[i.key]);
  return (
    <nav className="bottom-nav" aria-label="Navigation">
      {items.map(({ key, label, Icon, on, act }) => (
        <button
          key={key}
          type="button"
          className={`bottom-nav-btn${on ? " active" : ""}`}
          onClick={act}
          aria-current={on ? "page" : undefined}
        >
          <Icon size={22} />
          <span className="bottom-nav-label">{label}</span>
        </button>
      ))}
    </nav>
  );
}
