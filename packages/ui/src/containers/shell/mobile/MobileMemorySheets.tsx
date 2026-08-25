import { BRAND } from "@openmasq/branding";
import { useEffect, useState } from "react";
import { BottomSheet, TrashIcon } from "../../../components/brand";
import { MAX_FACTS_CHARS, MAX_PROFILE_CHARS, memoryCategory } from "../../../memory";
import type { MemoryCard } from "../../../types";
import { toneStyle } from "./memoryScreenModel";

/**
 * The three bottom sheets of the mobile Mémoire (kit `chat-app-mobile` MemoryScreen):
 * add a souvenir, inspect/edit one, edit the profile. They are the phone's stand-in for
 * the desktop's side panel, and they write through the SAME store callbacks — the shapes
 * differ, the data path does not.
 */

/** Add a card to a chosen category. `onAdd` is the store's, so the card is minted there. */
export function MemoryAddSheet({
  cat,
  onClose,
  onAdd,
}: {
  /** The category the "+" was tapped on — null = closed. */
  cat: { id: string; label: string } | null;
  onClose: () => void;
  onAdd: (entity: string, cat: string) => void;
}) {
  const [draft, setDraft] = useState("");
  useEffect(() => {
    if (cat) setDraft("");
  }, [cat]);
  const commit = () => {
    const v = draft.trim();
    if (!v || !cat) return;
    onAdd(v, cat.id);
    onClose();
  };
  return (
    <BottomSheet open={!!cat} onClose={onClose} maxH="auto" label="Ajouter un souvenir">
      {cat && (
        <div className="mmem-sheet">
          <div className="mmem-sheet-title">Ajouter à « {cat.label} »</div>
          <input
            className="mmem-input"
            value={draft}
            autoFocus
            placeholder="Nouveau souvenir…"
            aria-label="Nom du souvenir"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && commit()}
          />
          <button type="button" className="btn-primary mmem-cta" disabled={!draft.trim()} onClick={commit}>
            Ajouter
          </button>
        </div>
      )}
    </BottomSheet>
  );
}

/**
 * Inspect one card: its name, its durable facts, and delete. Both fields are bounded the
 * same way the store bounds them (`MAX_FACTS_CHARS`) — a card COMPACTS over time, it never
 * grows into a transcript. Edits commit on close, so a thumb-typed correction isn't lost
 * to a stray tap outside the sheet.
 */
export function MemoryCardSheet({
  card,
  onClose,
  onUpdate,
  onRemove,
}: {
  card: MemoryCard | null;
  onClose: () => void;
  onUpdate: (id: string, patch: Partial<Omit<MemoryCard, "id" | "createdAt">>) => void;
  onRemove: (id: string) => void;
}) {
  const [entity, setEntity] = useState("");
  const [facts, setFacts] = useState("");
  useEffect(() => {
    if (card) {
      setEntity(card.entity);
      setFacts(card.facts);
    }
  }, [card]);
  const close = () => {
    if (card) {
      const e = entity.trim();
      const f = facts.trim();
      if (e && (e !== card.entity || f !== card.facts)) onUpdate(card.id, { entity: e, facts: f });
    }
    onClose();
  };
  return (
    <BottomSheet open={!!card} onClose={close} maxH="auto" label="Souvenir">
      {card && (
        <div className="mmem-sheet">
          <div className="mmem-sheet-head">
            <span className="mmem-dot" style={toneStyle(memoryCategory(card.cat).tone)} aria-hidden="true" />
            <span className="mmem-sheet-cat">{memoryCategory(card.cat).label}</span>
            {card.source === "auto" && <span className="mmem-auto-badge">noté par {BRAND.name}</span>}
          </div>
          <input
            className="mmem-input"
            value={entity}
            aria-label="Nom du souvenir"
            onChange={(e) => setEntity(e.target.value)}
          />
          <textarea
            className="mmem-textarea"
            value={facts}
            rows={4}
            maxLength={MAX_FACTS_CHARS}
            placeholder="Ce qu'il faut retenir — un fait durable, pas une conversation."
            aria-label="Faits"
            onChange={(e) => setFacts(e.target.value)}
          />
          <button
            type="button"
            className="mmem-danger"
            onClick={() => {
              onRemove(card.id);
              onClose();
            }}
          >
            <TrashIcon size={18} /> Supprimer de la mémoire
          </button>
        </div>
      )}
    </BottomSheet>
  );
}

/** The always-injected profile — standing context, bounded by `MAX_PROFILE_CHARS`. */
export function MemoryProfileSheet({
  open,
  profile,
  onClose,
  onSave,
}: {
  open: boolean;
  profile: string;
  onClose: () => void;
  onSave: (profile: string) => void;
}) {
  const [draft, setDraft] = useState(profile);
  useEffect(() => {
    if (open) setDraft(profile);
  }, [open, profile]);
  return (
    <BottomSheet open={open} onClose={onClose} maxH="auto" label="Profil de mémoire">
      <div className="mmem-sheet">
        <div className="mmem-sheet-title">Profil</div>
        <textarea
          className="mmem-textarea"
          value={draft}
          rows={5}
          maxLength={MAX_PROFILE_CHARS}
          placeholder="Ex. Consultant indépendant, clients PME, répond en français, ton direct."
          aria-label="Profil de mémoire"
          onChange={(e) => setDraft(e.target.value)}
        />
        <button
          type="button"
          className="btn-primary mmem-cta"
          onClick={() => {
            onSave(draft);
            onClose();
          }}
        >
          Enregistrer
        </button>
      </div>
    </BottomSheet>
  );
}
