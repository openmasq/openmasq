import { BRAND } from "@openmasq/branding";
import { useMemo, useState } from "react";
import { PlusIcon, Switch } from "../../../components/brand";
import { memoryCategory } from "../../../memory";
import type { MemoryCard, MemoryData } from "../../../types";
import { groupMemoryCards, toneStyle } from "./memoryScreenModel";
import { MemoryAddSheet, MemoryCardSheet, MemoryProfileSheet } from "./MobileMemorySheets";

/**
 * The mobile Mémoire (kit `chat-app-mobile` MemoryScreen). The desktop draws the cards as
 * a force-directed graph — a canvas you drag with a mouse; here they are category groups
 * of tappable chips, which is the same information a thumb can actually reach.
 *
 * The controls the kit's mock omits are kept, because they are features and not
 * decoration: the always-injected **Profil** (a row that opens its own sheet) and the
 * **extraction automatique** switch. Dropping them would quietly make the phone a
 * read-only, less capable Mémoire.
 *
 * ⚠️ The semantic clustering (`memory/cluster.ts`) is deliberately NOT used here: it
 * needs `host.memoryIndex`, an on-device embedder mobile does not have, and its output is
 * a graph layout anyway. The category grouping is the store's own and needs nothing.
 *
 * ⚠️ Desktop-ahead, not platform-impossible: the REVIEW flow (« À revoir » inbox +
 * Confirmer + delete undo, `pages/Memory/useMemoryReview.ts`) and the per-card usage
 * line (`memory/usage.ts`) are not ported yet — nothing here prevents them; port them
 * by reusing those two pure pieces, not by re-deriving the rules.
 */
export function MobileMemoryScreen({
  memoire,
  memoryAuto,
  onToggleAuto,
  onSetProfile,
  onAdd,
  onUpdate,
  onRemove,
}: {
  memoire: MemoryData;
  memoryAuto: boolean;
  onToggleAuto: (on: boolean) => void;
  onSetProfile: (profile: string) => void;
  onAdd: (input: { entity: string; facts: string; cat?: string }) => MemoryCard | null;
  onUpdate: (id: string, patch: Partial<Omit<MemoryCard, "id" | "createdAt">>) => void;
  onRemove: (id: string) => void;
}) {
  const groups = useMemo(() => groupMemoryCards(memoire.cards), [memoire.cards]);
  const [addTo, setAddTo] = useState<{ id: string; label: string } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  // Read the card fresh from the store each render so an edit re-renders the sheet.
  const openCard = memoire.cards.find((c) => c.id === openId) ?? null;
  const total = memoire.cards.length;
  const profile = memoire.profile?.trim() ?? "";

  return (
    <div className="mobile-screen mmem">
      <header className="mmem-head">
        <h1 className="mmem-title">Mémoire</h1>
        <p className="mmem-sub">
          Ce que {BRAND.name} retient d'une conversation à l'autre — <strong>{total}</strong>{" "}
          élément{total === 1 ? "" : "s"}. Tout reste sur votre machine et part redacted.
        </p>
      </header>

      <div className="mmem-body">
        <button type="button" className="mmem-profile" onClick={() => setProfileOpen(true)}>
          <span className="mmem-profile-label">Profil</span>
          <span className={`mmem-profile-text${profile ? "" : " empty"}`}>
            {profile || `Qui vous êtes et ce que ${BRAND.name} doit garder en tête.`}
          </span>
        </button>

        <label className="mmem-auto">
          <Switch checked={memoryAuto} onChange={onToggleAuto} />
          <span>
            Extraction automatique — {BRAND.name} note seul les faits durables, à partir du texte
            déjà redacted.
          </span>
        </label>

        {groups.length === 0 ? (
          <p className="mmem-empty">
            Rien en mémoire pour l'instant.
            <span className="mmem-empty-sub">
              Dites « retiens que… » dans une conversation, ou ajoutez une fiche ci-dessous.
            </span>
            <button
              type="button"
              className="btn-primary mmem-cta"
              onClick={() => setAddTo({ id: "personne", label: memoryCategory("personne").label })}
            >
              <PlusIcon size={16} /> Nouvelle fiche
            </button>
          </p>
        ) : (
          groups.map((g) => (
            <section key={g.id} className="mmem-group">
              <div className="mmem-group-head">
                {/* Per-category tone from data — rule 6's allowed runtime-style case,
                    and the same `--hl-*` mapping the desktop graph paints with. */}
                <span className="mmem-dot" style={toneStyle(g.tone)} aria-hidden="true" />
                <span className="mmem-group-name">{g.label}</span>
                <span className="mmem-group-n">{g.cards.length}</span>
                <span className="mmem-group-spacer" />
                <button
                  type="button"
                  className="mmem-group-add"
                  aria-label={`Ajouter à ${g.label}`}
                  onClick={() => setAddTo({ id: g.id, label: g.label })}
                >
                  <PlusIcon size={16} />
                </button>
              </div>
              <div className="mmem-chips">
                {g.cards.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="mmem-chip"
                    onClick={() => setOpenId(c.id)}
                  >
                    <span className="mmem-dot sm" style={toneStyle(g.tone)} aria-hidden="true" />
                    {c.entity}
                  </button>
                ))}
              </div>
            </section>
          ))
        )}
      </div>

      <MemoryAddSheet
        cat={addTo}
        onClose={() => setAddTo(null)}
        onAdd={(entity, cat) => {
          const card = onAdd({ entity, facts: "", cat });
          // Land straight in the new card so a souvenir is never created empty and lost.
          if (card) setOpenId(card.id);
        }}
      />
      <MemoryCardSheet
        card={openCard}
        onClose={() => setOpenId(null)}
        onUpdate={onUpdate}
        onRemove={onRemove}
      />
      <MemoryProfileSheet
        open={profileOpen}
        profile={profile}
        onClose={() => setProfileOpen(false)}
        onSave={onSetProfile}
      />
    </div>
  );
}
