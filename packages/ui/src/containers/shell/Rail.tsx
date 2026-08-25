import { useMemo } from "react";
import {
  PlusIcon,
  MessageIcon,
  BookIcon,
  LockIcon,
  SparklesIcon,
  MemoryIcon,
  SearchIcon,
  ShieldIcon,
  Avatar,
} from "../../components/brand";
import { BrandMark } from "../../components/media/BrandLogo";
import type { Conversation } from "../../types";
import { useAppSelector } from "../../state/redux";
import { useFeatureAccess } from "../../state/featureAccess";
import { protectedCount } from "../../state/protectedCount";
import { sectionGuide } from "../../help";
import { useSectionNav } from "./useSectionNav";

/** The tooltip for a section: its label AND what it is for, from the one vocabulary
 *  (`help/sections.ts`). A tip that only repeats the label taught nothing — and four of
 *  these six names are the app's own words, so the rail was the app's least legible part. */
const tip = (id: Parameters<typeof sectionGuide>[0]): string => sectionGuide(id)?.tip ?? id;

interface Props {
  conversations: Conversation[];
  /** Expand the full conversation sidebar (logo click). */
  onExpand: () => void;
  onNew: () => void;
  onSelect: (id: string) => void;
  /** Open the ⌘K search palette (owned by AppShell). */
  onOpenSearch: () => void;
  /** Open the "Votre avis" modal. Absent when the platform has no `host.avis` —
   *  the action is then not rendered at all rather than offered and dead. */
  userName?: string;
  /** Ouvrir Réglages SUR UN ONGLET. Le bouclier promet le rapport de confidentialité :
   *  sans cet argument il ne pouvait que déposer sur l'onglet par défaut (Compte). */
  onOpenSettings: (tab?: string) => void;
}

/**
 * Collapsed sidebar = the compact icon rail (matching the chat-app kit): brand
 * mark (expands the sidebar), new chat, Chats / Bibliothèque nav, Search (⌘K),
 * then a spacer, the privacy shield and the account avatar — both opening
 * settings. Shown when the conversation sidebar is collapsed.
 */
export function Rail({
  conversations,
  onExpand,
  onNew,
  onSelect,
  onOpenSearch,
  userName = "Vous",
  onOpenSettings,
}: Props) {
  const { section, go } = useSectionNav();
  // Les portes gouvernables (`state/featureAccess.ts`) : une porte fermée ne rend
  // pas son entrée. La fonctionnalité, elle, continue de tourner — sauf Compétences.
  const access = useFeatureAccess();
  // The Mémoire « nouveau » dot — raised on a background note, cleared on visit.
  const memoryFresh = useAppSelector((s) => s.ui.memoryFresh);
  // The SAME number the confidentialité report shows (`state/protectedCount.ts`) —
  // this shield opens that report, so the two must not disagree.
  const protectedN = useMemo(() => protectedCount(conversations), [conversations]);

  return (
    <div className="rail">
      <button
        className="rail-btn rail-logo"
        onClick={onExpand}
        data-tip="Développer la barre latérale"
        aria-label="Développer la barre latérale"
      >
        <BrandMark size={24} className="brand-mark" />
      </button>

      <button className="rail-new" onClick={onNew} data-tip="Nouvelle conversation" aria-label="Nouvelle conversation">
        <PlusIcon size={18} />
      </button>

      <button
        className="rail-btn"
        onClick={onOpenSearch}
        data-tip="Rechercher (⌘K)"
        aria-label="Rechercher"
      >
        <SearchIcon size={18} />
      </button>

      <button
        className={`rail-btn rail-nav ${section === "chats" ? "active" : ""}`}
        onClick={() => go("chats")}
        data-tip={tip("chats")}
        aria-label="Conversations"
      >
        <MessageIcon size={16} />
      </button>
      {access.library && (
        <button
          className={`rail-btn rail-nav ${section === "library" ? "active" : ""}`}
          onClick={() => go("library")}
          data-tip={tip("library")}
          aria-label="Bibliothèque"
        >
          <BookIcon size={16} />
        </button>
      )}
      {access.competences && (
        <button
          className={`rail-btn rail-nav ${section === "competences" ? "active" : ""}`}
          onClick={() => go("competences")}
          data-tip={tip("competences")}
          aria-label="Compétences"
        >
          <SparklesIcon size={16} />
        </button>
      )}
      {access.memory && (
        <button
          className={`rail-btn rail-nav ${section === "memory" ? "active" : ""}`}
          onClick={() => go("memory")}
          data-tip={memoryFresh ? "Mémoire — nouveaux souvenirs notés" : tip("memory")}
          aria-label={memoryFresh ? "Mémoire — nouveaux souvenirs notés" : "Mémoire"}
        >
          <MemoryIcon size={16} />
          {/* Background extraction noted something the user hasn't seen — cleared on visit. */}
          {memoryFresh && <span className="rail-note-dot" aria-hidden="true" />}
        </button>
      )}
      <button
        className={`rail-btn rail-nav ${section === "vault" ? "active" : ""}`}
        onClick={() => go("vault")}
        data-tip={tip("vault")}
        aria-label="Coffre"
      >
        <LockIcon size={16} />
      </button>

      <div className="rail-spacer" />

      {/* ⚠️ Le bouclier ouvre « Confidentialité », PAS l'onglet par défaut. Les deux
          boutons appelaient `go("settings")`, donc le bouclier déposait sur « Compte » —
          un bouton qui annonce « rapport de confidentialité » et ouvre la page du compte.
          Pour une avocate c'est LA pièce qu'on lui demande (prouver que le secret
          professionnel a tenu), et l'app la lui refusait par un aiguillage. */}
      <button
        className="rail-btn"
        onClick={() => onOpenSettings("privacy")}
        data-tip={`${protectedN} élément(s) protégé(s) — rapport de confidentialité`}
        aria-label="Rapport de confidentialité"
      >
        <ShieldIcon size={18} />
      </button>
      <button
        className="rail-avatar"
        onClick={() => onOpenSettings()}
        data-tip="Compte & paramètres"
        aria-label="Compte & paramètres"
      >
        <Avatar name={userName} size={30} muted />
      </button>

    </div>
  );
}
