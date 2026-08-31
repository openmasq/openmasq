import type { Messages } from "@openmasq/i18n";
import { useState } from "react";
import { ModalShell } from "../../containers/modals/ModalShell";
import { ModalTitle } from "../../containers/modals/ModalTitle";
import { ChevDownIcon, HueSelect, type HueOption } from "../../components/brand";
import { competenceCategories, competenceCategory } from "../../competences/competences";
import {
  isUntouchedDraft,
  isRoutineTemplate,
  templateCategory,
  type AnyTemplate,
} from "../../suggestions";
import { CompetenceSuggestPane } from "./parts/CompetenceSuggestPane";
import { PromptFileField } from "./parts/PromptFileField";
import { ServerPicker } from "./parts/ServerPicker";
import type { Competence } from "../../types";

import { useT } from "../../i18n";
/** The category vocabulary, mapped for the shared picker. Module-level: the list is
 *  static, so it never needs to be rebuilt per render. */
/** Un ensemble vide STABLE : une nouvelle `Set` par rendu re-rendrait le sélecteur à
 *  chaque frappe dans le nom. */
const EMPTY_CONNECTED: ReadonlySet<string> = new Set<string>();

const catOptions = (t: Messages): HueOption[] =>
  competenceCategories(t).map((c) => ({ value: c.id, label: c.label, tone: c.tone, glyph: c.glyph }));

/** The draft a create/edit modal edits. `id` absent ⇒ a new compétence. */
export interface CompetenceDraft {
  id?: string;
  name: string;
  desc: string;
  prompt: string;
  cat: string;
  /** Les connecteurs que la compétence pilote. Vide = un prompt, sans effet sur les
   *  outils du tour — ce qu'était une compétence avant que les deux listes fusionnent. */
  servers: string[];
}

export function competenceToDraft(c: Competence): CompetenceDraft {
  return {
    id: c.id,
    name: c.name,
    desc: c.desc ?? "",
    prompt: c.prompt,
    cat: c.cat,
    servers: c.servers ?? [],
  };
}

export const EMPTY_DRAFT: CompetenceDraft = {
  name: "",
  desc: "",
  prompt: "",
  cat: "redaction",
  servers: [],
};

/**
 * Create / edit one compétence. Owns only its form state; saving and deleting are
 * props, so the page keeps the store writes.
 *
 * ⚠️ **C'est ICI que les deux anciennes listes se rejoignent.** Une compétence et un
 * « workflow » avaient deux modales jumelles ; il n'en reste qu'une, et le seul champ qui
 * les distinguait — les connecteurs — est un DÉPLIANT, replié par défaut. C'est ce qui
 * permet de n'avoir rien perdu sans rien alourdir : écrire un prompt de prose ne demande
 * pas de savoir ce qu'est un connecteur, et en choisir un fait basculer la catégorie sur
 * « Routines » de lui-même, pour que la liste reste rangée sans qu'on y pense.
 *
 * Ported from the design kit's `SkillModal` (`.claude/skills/design-system/ui_kits/
 * chat-app/ChatShell.jsx`) — the category-tinted head band, the PROMPT.txt "file"
 * framing and the character count are the modal's identity, not decoration: the band
 * retints live as you pick a category, so the tone you are filing under is visible
 * before you save.
 *
 * Imports ModalShell/ModalTitle BY FILE, not via the `containers/modals` barrel:
 * that barrel re-exports AttachmentPreviewModal, which imports back up into
 * `pages/` — going through it from a page would close an import cycle.
 */
export function CompetenceModal({
  initial,
  onClose,
  onSave,
  onDelete,
  onDuplicate,
  suggestions,
  connected,
}: {
  initial: CompetenceDraft;
  onClose: () => void;
  onSave: (d: CompetenceDraft) => void;
  /** Absent for a NEW compétence — there is nothing to delete yet. */
  onDelete?: () => void;
  /** Fork the CURRENT draft (unsaved edits included) as a new, id-less compétence —
   *  the page swaps the draft and remounts this modal prefilled. Absent when new. */
  onDuplicate?: (d: CompetenceDraft) => void;
  /** Starter templates offered on a NEW compétence (`suggestions/`). Picking one
   *  prefills the whole form; the strip hides on the first edit, so it can never
   *  overwrite typed work. */
  suggestions?: readonly AnyTemplate[];
  /** Catalog ids with a connected account — the picker's « connecté » cue. Queried
   *  ONCE by the page, so the cue and the template ranking can't disagree. */
  connected?: ReadonlySet<string>;
}) {
  const t = useT();
  const [draft, setDraft] = useState<CompetenceDraft>(initial);
  // Le dépliant des connecteurs s'ouvre de lui-même sur une compétence qui en porte
  // déjà : le replier sur une routine existante cacherait ce qu'elle fait.
  const [showServers, setShowServers] = useState(initial.servers.length > 0);
  const patch = (p: Partial<CompetenceDraft>) => setDraft((d) => ({ ...d, ...p }));
  // Same bar as `makeCompetence`: a compétence with no name or no prompt is not a
  // thing, so the primary action stays disabled rather than failing silently.
  const canSave = !!draft.name.trim() && !!draft.prompt.trim();
  const cat = competenceCategory(draft.cat, t);
  // Templates only on a NEW compétence: editing one is not the moment to be offered
  // a replacement for it.
  const offered = !initial.id && suggestions?.length ? suggestions : [];
  const pickedId = offered.find(
    (s) => s.name === draft.name && s.desc === draft.desc && s.prompt === draft.prompt,
  )?.id;
  // The side panel is PERMANENT now, so a pick can no longer rely on « the strip is
  // gone once you type » to be harmless: a dirty draft turns the first click into a
  // question, answered by clicking the same card again. Same rule as the Workflows
  // twin — no data lost, and no dialog stacked on a dialog.
  const [confirmingId, setConfirmingId] = useState<string | undefined>();
  const pick = (id: string) => {
    const s = offered.find((x) => x.id === id);
    if (!s) return;
    if (!isUntouchedDraft(draft, offered) && confirmingId !== id) {
      setConfirmingId(id);
      return;
    }
    setConfirmingId(undefined);
    const servers = isRoutineTemplate(s) ? [...s.servers] : [];
    setDraft({ name: s.name, desc: s.desc, prompt: s.prompt, cat: templateCategory(s), servers });
    setShowServers(servers.length > 0);
  };

  /** Cocher un connecteur range la compétence dans « Routines » — mais seulement tant que
   *  la catégorie est encore celle du formulaire vierge : une catégorie CHOISIE ne se
   *  fait pas réécrire sous les doigts de qui l'a choisie. */
  const toggleServer = (id: string) =>
    setDraft((d) => {
      const servers = d.servers.includes(id)
        ? d.servers.filter((x) => x !== id)
        : [...d.servers, id];
      const cat = servers.length && d.cat === EMPTY_DRAFT.cat ? "routine" : d.cat;
      return { ...d, servers, cat };
    });

  return (
    <ModalShell onClose={onClose} width={offered.length ? "940px" : "580px"} maxHeight="88vh">
      <div className="om-skill-modal">
        {/* NEUTRAL head band (monochrome) — the category hues no longer decorate the
            compétences chrome; the redaction keeps the colour language. */}
        <div className="om-skill-head">
          <div className="om-skill-head-row">
            <span className="om-skill-head-glyph">{cat.glyph}</span>
            <div className="om-skill-head-text">
              <ModalTitle>
                {initial.id ? t.lists.competences.modal.titleEdit : t.lists.competences.modal.titleNew}
              </ModalTitle>
              <p className="om-skill-head-sub">
                {t.lists.competences.modal.sub}
              </p>
            </div>
          </div>
        </div>

        <div className={`om-skill-modal-body${offered.length ? " om-split" : ""}`}>
          {/* LEFT column, and FIRST in the markup so the tab order matches what the
              eye reads. Absent on an EDIT, where the modal keeps its original
              single-column shape. */}
          {offered.length > 0 && (
            <CompetenceSuggestPane
              suggestions={offered}
              pickedId={pickedId}
              confirmingId={confirmingId}
              onPick={pick}
            />
          )}

          <div className="om-split-main">
          {/* Name + category share a row (kit layout) — which is why the category is a
              dropdown and not a tag row: tags need their own full-width line. The picker
              carries each category's tone + glyph, and the head band above still retints
              the moment you pick, so the choice reads twice. */}
          <div className="om-skill-row">
            <label className="om-skill-field om-skill-col-grow">
              <span className="cv-eyebrow">{t.lists.competences.modal.name}</span>
              <input
                className="om-skill-input"
                value={draft.name}
                onChange={(e) => patch({ name: e.target.value })}
                placeholder={t.lists.competences.modal.namePlaceholder}
                autoFocus
              />
            </label>
            <div className="om-skill-field om-skill-col-cat">
              <span className="cv-eyebrow">{t.lists.competences.modal.category}</span>
              <HueSelect
                value={draft.cat}
                options={catOptions(t)}
                onChange={(cat) => patch({ cat })}
                ariaLabel={t.lists.competences.modal.category}
                neutral
              />
            </div>
          </div>

          <label className="om-skill-field">
            <span className="cv-eyebrow">{t.lists.competences.modal.description}</span>
            <input
              className="om-skill-input"
              value={draft.desc}
              onChange={(e) => patch({ desc: e.target.value })}
              placeholder={t.lists.competences.modal.descriptionPlaceholder}
            />
          </label>

          <PromptFileField
            prompt={draft.prompt}
            onChange={(prompt) => patch({ prompt })}
            note={
              draft.servers.length
                ? t.lists.competences.modal.noteWithServers
                : t.lists.competences.modal.noteWithoutServers
            }
          />

          {/* Les connecteurs, DÉPLIÉS à la demande. C'est le seul champ qui distinguait
              un « workflow » d'une compétence ; replié, il ne demande rien à qui écrit
              simplement un prompt. Le résumé sur la ligne dit l'état sans l'ouvrir. */}
          <div className="om-skill-field">
            <button
              type="button"
              className={`om-skill-disclose${showServers ? " on" : ""}`}
              onClick={() => setShowServers((v) => !v)}
              aria-expanded={showServers}
            >
              <ChevDownIcon size={15} />
              <span className="cv-eyebrow">{t.lists.competences.modal.connectors}</span>
              <span className="om-skill-disclose-sum">
                {draft.servers.length
                  ? t.lists.competences.modal.someConnectors(draft.servers.length)
                  : t.lists.competences.modal.allConnectors}
              </span>
            </button>
            {showServers && (
              <ServerPicker
                selected={draft.servers}
                connected={connected ?? EMPTY_CONNECTED}
                onToggle={toggleServer}
                onSelectAll={() => patch({ servers: [] })}
              />
            )}
          </div>
          </div>

        </div>

        <div className="om-skill-modal-foot">
          {onDelete && (
            <button type="button" className="btn-ghost om-skill-del" onClick={onDelete}>
              {t.lists.competences.modal.delete}
            </button>
          )}
          {onDuplicate && (
            <button
              type="button"
              className="btn-ghost"
              onClick={() => onDuplicate(draft)}
              title={t.lists.competences.modal.duplicateTip}
            >
              {t.lists.competences.modal.duplicate}
            </button>
          )}
          <span className="om-skill-spacer" />
          <button type="button" className="btn-ghost" onClick={onClose}>
            {t.common.cancel}
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!canSave}
            onClick={() => canSave && onSave(draft)}
          >
            {initial.id ? t.common.save : t.lists.competences.modal.create}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
