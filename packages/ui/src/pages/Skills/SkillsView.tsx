import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence } from "framer-motion";
import { PageHeader } from "../../containers/shell/PageHeader";
import {
  CreateCard,
  EmptyState,
  SparklesIcon,
  PlusIcon,
  SearchIcon,
} from "../../components/brand";
import { ImportSkillsModal, type SkillImportChoice } from "../../containers/modals";
import { useHost } from "../../host";
import {
  skillCategories,
  skillCategory,
  skillCounts,
  filterSkills,
} from "../../skills/skills";
import type { Skill } from "../../types";
import { SkillCard } from "./parts/SkillCard";
import { SkillRow } from "./parts/SkillRow";
import { SkillFilters } from "./parts/SkillFilters";
import { useViewMode } from "../../hooks/useViewMode";
import { useTemplates } from "./parts/useTemplates";
import {
  SkillModal,
  skillToDraft,
  EMPTY_DRAFT,
  type SkillDraft,
} from "./SkillModal";
import { useT } from "../../i18n";

/**
 * The COMPÉTENCES page — reusable prompts the user writes once and inserts into a
 * conversation. Mirrors the Coffre page's skeleton (PageHeader + a scrollable body
 * holding one centred column) so the two user-authored lists read the same.
 *
 * Every store write arrives as a prop: the page renders and collects decisions, it
 * doesn't make them.
 */
export function SkillsView({
  skills,
  onAdd,
  onUpdate,
  onRemove,
  onRestore,
  onTogglePin,
  onUse,
  onImport,
  requestedId,
  onToggleSidebar,
  orgBlock,
  onShareSkill,
  loaded = true,
}: {
  skills: Skill[];
  onAdd: (input: {
    name: string;
    prompt: string;
    desc?: string;
    cat?: string;
    servers?: string[];
  }) => void;
  onUpdate: (id: string, patch: Partial<Omit<Skill, "id" | "createdAt">>) => void;
  onRemove: (id: string) => void;
  /** Reinsert a just-deleted compétence verbatim (same id) — backs the undo bar. */
  onRestore?: (c: Skill) => void;
  onTogglePin: (id: string) => void;
  /** Insert into the composer + switch to the chat. */
  onUse: (c: Skill) => void;
  /** File an imported batch away. The sort goes BOTH ways (the import files some skills as
   *  routines), so it belongs to the container holding both lists — not to the screen. */
  onImport?: (items: SkillImportChoice[]) => void;
  /** Deep-link: open THIS compétence's editor on arrival. The `n` nonce re-opens
   *  the same id twice; a deleted compétence is silently ignored. */
  requestedId?: { id: string; n: number } | null;
  /** Expand/collapse the primary sidebar (shell-owned). */
  onToggleSidebar?: () => void;
  /** The SHARED sections (`parts/OrgCompetencesBlock`), composed by the
   *  section so this view stays ignorant of org state. Absent outside an org. */
  orgBlock?: ReactNode;
  /** Opens the « Partager » dialog for a personal compétence (section-owned). */
  onShareSkill?: (c: Skill) => void;
  /** False during the initial per-account load (see `VaultView`'s same prop). */
  loaded?: boolean;
}) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [view, setView] = useViewMode("competences");
  const [cat, setCat] = useState("all");
  const [draft, setDraft] = useState<SkillDraft | null>(null);
  const [importing, setImporting] = useState(false);
  const host = useHost();
  // The just-deleted compétence, held for the undo bar (auto-dismissed). The FULL
  // object, so "Annuler" restores it verbatim — same id, deep-links keep resolving.
  const [deleted, setDeleted] = useState<Skill | null>(null);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (dismissTimer.current) clearTimeout(dismissTimer.current); }, []);

  const removeWithUndo = (id: string) => {
    const c = skills.find((x) => x.id === id);
    onRemove(id);
    if (!c || !onRestore) return; // no restore path → no bar to offer
    setDeleted(c);
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    dismissTimer.current = setTimeout(() => setDeleted(null), 8000);
  };

  useEffect(() => {
    if (!requestedId) return;
    const c = skills.find((x) => x.id === requestedId.id);
    if (c) setDraft(skillToDraft(c));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedId?.id, requestedId?.n]);

  const counts = useMemo(() => skillCounts(skills), [skills]);
  const { suggestions, connected } = useTemplates(skills);
  const filtered = useMemo(
    () => filterSkills(skills, cat, query),
    [skills, cat, query],
  );

  // Only offer a category chip that has something in it (plus "Toutes") — an empty
  // filter is a dead end.
  const chips = useMemo(
    () => [
      { id: "all", label: t.lists.allFeminine },
      ...skillCategories(t).filter((c) => counts[c.id]),
    ],
    [counts, t],
  );

  const save = (d: SkillDraft) => {
    // `servers` is sent ALWAYS, empty included: clearing it is a change like any
    // other ("this routine no longer drives anything"), and omitting it would make that impossible.
    if (d.id)
      onUpdate(d.id, {
        name: d.name.trim(),
        desc: d.desc.trim() || undefined,
        prompt: d.prompt.trim(),
        cat: d.cat as Skill["cat"],
        servers: d.servers,
      });
    else onAdd({ name: d.name, prompt: d.prompt, desc: d.desc, cat: d.cat, servers: d.servers });
    setDraft(null);
  };

  return (
    <main className="library-page">
      {/* Kit `SkillsPage`: NO header action — creation lives in the grid's dashed
          CreateCard (and the empty state's CTA). */}
      <PageHeader
        section="competences"
        onToggleSidebar={onToggleSidebar}
      />

      <div className="library-body">
        <div className="om-skill-inner">
          <SkillFilters
            chips={chips}
            counts={counts}
            cat={cat}
            onCat={setCat}
            query={query}
            onQuery={setQuery}
            view={view}
            onView={setView}
            onImport={host.claudeSkills ? () => setImporting(true) : undefined}
          />

          {/* Shared sections FIRST (design: Orga, Équipe, then the personal grid). */}
          {orgBlock}

          {filtered.length === 0 ? (
            skills.length === 0 && !loaded ? (
              <div className="library-empty">{t.lists.loading}</div>
            ) : skills.length === 0 ? (
              <EmptyState
                tone="lime"
                eyebrow={t.sections.skills.label}
                icon={<SparklesIcon size={26} />}
                title={t.lists.skills.empty.title}
                body={t.lists.skills.empty.body}
                points={[
                  { glyph: "✦", label: t.lists.skills.empty.points[0], tone: "violet" },
                  { glyph: "★", label: t.lists.skills.empty.points[1], tone: "amber" },
                ]}
                cta={t.lists.skills.empty.cta}
                ctaIcon={<PlusIcon size={16} />}
                onCta={() => setDraft(EMPTY_DRAFT)}
              />
            ) : (
              <EmptyState
                tone="sky"
                eyebrow={
                  cat === "all"
                    ? t.lists.skills.noMatch.search
                    : `${t.lists.skills.noMatch.category} · ${skillCategory(cat, t).label}`
                }
                icon={<SearchIcon size={26} />}
                title={t.lists.skills.noMatch.title}
                body={t.lists.skills.noMatch.body}
                cta={t.lists.skills.noMatch.cta}
                ctaIcon={<PlusIcon size={16} />}
                onCta={() => setDraft(EMPTY_DRAFT)}
              />
            )
          ) : (
            <div className={view === "list" ? "om-rows" : "om-skill-grid"}>
              {view === "grid" ? (
                <CreateCard
                  label={t.lists.skills.createLabel}
                  hint={t.lists.skills.createHint}
                  onClick={() => setDraft(EMPTY_DRAFT)}
                />
              ) : (
                // Creation stays a ROW: removing the card without replacing it
                // would remove this screen's only path to « nouvelle ».
                <button type="button" className="om-row om-row-create" onClick={() => setDraft(EMPTY_DRAFT)}>
                  <span className="om-row-mark">
                    <PlusIcon size={15} />
                  </span>
                  <span className="om-row-main">
                    <span className="om-row-name">{t.lists.skills.createLabel}</span>
                    <span className="om-row-sub">{t.lists.skills.createHint}</span>
                  </span>
                </button>
              )}
              {filtered.map((c) => {
                const p = {
                  skill: c,
                  selected: draft?.id === c.id,
                  onEdit: () => setDraft(skillToDraft(c)),
                  onUse: () => onUse(c),
                  onTogglePin: () => onTogglePin(c.id),
                  scope: orgBlock ? "personal" : undefined,
                  onShare: onShareSkill ? () => onShareSkill(c) : undefined,
                };
                return view === "list" ? <SkillRow key={c.id} {...p} /> : <SkillCard key={c.id} {...p} />;
              })}
            </div>
          )}
        </div>
      </div>

      {/* Undo bar: a deleted compétence is real user work — offer the way back for
          a few seconds. Plain DOM, no dialog role (agent-browser modal gate). */}
      {deleted && (
        <div className="om-skill-undo om-step-in" role="status">
          <span className="om-skill-undo-text">« {deleted.name} » supprimée.</span>
          <button
            type="button"
            className="om-skill-undo-btn"
            onClick={() => {
              onRestore?.(deleted);
              setDeleted(null);
              if (dismissTimer.current) clearTimeout(dismissTimer.current);
            }}
          >
            {t.lists.skills.undo}
          </button>
        </div>
      )}

      {/* AnimatePresence at the CALL SITE; `key` remounts on Dupliquer's id-less
          copy — the modal owns its form state, a prop change would not re-seed. */}
      <AnimatePresence>
        {importing && (
          <ImportSkillsModal
            onClose={() => setImporting(false)}
            onImport={(items) => onImport?.(items)}
          />
        )}
        {draft && (
          <SkillModal
            key={draft.id ?? "new"}
            initial={draft}
            suggestions={suggestions}
            connected={connected}
            onClose={() => setDraft(null)}
            onSave={save}
            onDelete={
              draft.id
                ? () => {
                    removeWithUndo(draft.id as string);
                    setDraft(null);
                  }
                : undefined
            }
            onDuplicate={
              draft.id
                ? (d) => setDraft({ ...d, id: undefined, name: `${d.name.trim() || "Sans titre"} (copie)` })
                : undefined
            }
          />
        )}
      </AnimatePresence>
    </main>
  );
}
