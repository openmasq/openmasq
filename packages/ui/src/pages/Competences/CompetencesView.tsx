import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence } from "framer-motion";
import { PageHeader } from "../../containers/shell/PageHeader";
import { sectionSubtitle } from "../../help";
import {
  CreateCard,
  DownloadIcon,
  EmptyState,
  SparklesIcon,
  PlusIcon,
  SearchIcon,
} from "../../components/brand";
import { ImportSkillsModal, type SkillImportChoice } from "../../containers/modals";
import { useHost } from "../../host";
import {
  COMPETENCE_CATEGORIES,
  competenceCounts,
  filterCompetences,
} from "../../competences/competences";
import type { Competence } from "../../types";
import { CompetenceCard } from "./parts/CompetenceCard";
import { CompetenceRow } from "./parts/CompetenceRow";
import { CompetenceFilters } from "./parts/CompetenceFilters";
import { useViewMode } from "../../hooks/useViewMode";
import { useTemplates } from "./parts/useTemplates";
import {
  CompetenceModal,
  competenceToDraft,
  EMPTY_DRAFT,
  type CompetenceDraft,
} from "./CompetenceModal";

/**
 * The COMPÉTENCES page — reusable prompts the user writes once and inserts into a
 * conversation. Mirrors the Coffre page's skeleton (PageHeader + a scrollable body
 * holding one centred column) so the two user-authored lists read the same.
 *
 * Every store write arrives as a prop: the page renders and collects decisions, it
 * doesn't make them.
 */
export function CompetencesView({
  competences,
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
  onShareCompetence,
  loaded = true,
}: {
  competences: Competence[];
  onAdd: (input: {
    name: string;
    prompt: string;
    desc?: string;
    cat?: string;
    servers?: string[];
  }) => void;
  onUpdate: (id: string, patch: Partial<Omit<Competence, "id" | "createdAt">>) => void;
  onRemove: (id: string) => void;
  /** Reinsert a just-deleted compétence verbatim (same id) — backs the undo bar. */
  onRestore?: (c: Competence) => void;
  onTogglePin: (id: string) => void;
  /** Insert into the composer + switch to the chat. */
  onUse: (c: Competence) => void;
  /** Ranger un lot importé. Le tri va des DEUX côtés (l'import range certains skills en
   *  workflow), donc il appartient au conteneur qui tient les deux listes — pas à l'écran. */
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
  onShareCompetence?: (c: Competence) => void;
  /** False during the initial per-account load (see `VaultView`'s same prop). */
  loaded?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [view, setView] = useViewMode("competences");
  const [cat, setCat] = useState("all");
  const [draft, setDraft] = useState<CompetenceDraft | null>(null);
  const [importing, setImporting] = useState(false);
  const host = useHost();
  // The just-deleted compétence, held for the undo bar (auto-dismissed). The FULL
  // object, so "Annuler" restores it verbatim — same id, deep-links keep resolving.
  const [deleted, setDeleted] = useState<Competence | null>(null);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (dismissTimer.current) clearTimeout(dismissTimer.current); }, []);

  const removeWithUndo = (id: string) => {
    const c = competences.find((x) => x.id === id);
    onRemove(id);
    if (!c || !onRestore) return; // no restore path → no bar to offer
    setDeleted(c);
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    dismissTimer.current = setTimeout(() => setDeleted(null), 8000);
  };

  useEffect(() => {
    if (!requestedId) return;
    const c = competences.find((x) => x.id === requestedId.id);
    if (c) setDraft(competenceToDraft(c));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedId?.id, requestedId?.n]);

  const counts = useMemo(() => competenceCounts(competences), [competences]);
  const { suggestions, connected } = useTemplates(competences);
  const filtered = useMemo(
    () => filterCompetences(competences, cat, query),
    [competences, cat, query],
  );

  // Only offer a category chip that has something in it (plus "Toutes") — an empty
  // filter is a dead end.
  const chips = useMemo(
    () => [
      { id: "all", label: "Toutes" },
      ...COMPETENCE_CATEGORIES.filter((c) => counts[c.id]),
    ],
    [counts],
  );

  const save = (d: CompetenceDraft) => {
    // `servers` part TOUJOURS, y compris vide : le vider est une modification comme une
    // autre (« cette routine ne pilote plus rien »), et l'omettre la rendrait impossible.
    if (d.id)
      onUpdate(d.id, {
        name: d.name.trim(),
        desc: d.desc.trim() || undefined,
        prompt: d.prompt.trim(),
        cat: d.cat as Competence["cat"],
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
        title="Compétences"
        subtitle={sectionSubtitle("competences")}
        onToggleSidebar={onToggleSidebar}
      />

      <div className="library-body">
        <div className="om-skill-inner">
          <CompetenceFilters
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
            competences.length === 0 && !loaded ? (
              <div className="library-empty">Chargement…</div>
            ) : competences.length === 0 ? (
              <EmptyState
                tone="lime"
                eyebrow="Compétences"
                icon={<SparklesIcon size={26} />}
                title="Vos consignes, prêtes à réutiliser"
                body="Une bonne consigne écrite une fois — réponse e-mail, traduction, résumé — réutilisable partout."
                points={[
                  { glyph: "✦", label: "Rangées par catégorie", tone: "violet" },
                  { glyph: "★", label: "Épinglables", tone: "amber" },
                ]}
                cta="Créer ma première compétence"
                ctaIcon={<PlusIcon size={16} />}
                onCta={() => setDraft(EMPTY_DRAFT)}
              />
            ) : (
              <EmptyState
                tone="sky"
                eyebrow={
                  cat === "all"
                    ? "Recherche"
                    : `Catégorie · ${COMPETENCE_CATEGORIES.find((c) => c.id === cat)?.label ?? cat}`
                }
                icon={<SearchIcon size={26} />}
                title="Rien ici pour ce filtre."
                body="Aucune compétence ne correspond à cette catégorie ou à votre recherche. Essayez « Toutes » ou créez-en une nouvelle."
                cta="Nouvelle compétence"
                ctaIcon={<PlusIcon size={16} />}
                onCta={() => setDraft(EMPTY_DRAFT)}
              />
            )
          ) : (
            <div className={view === "list" ? "om-rows" : "om-skill-grid"}>
              {view === "grid" ? (
                <CreateCard
                  label="Nouvelle compétence"
                  hint="Un prompt réutilisable"
                  onClick={() => setDraft(EMPTY_DRAFT)}
                />
              ) : (
                // La création reste une RANGÉE : retirer la carte sans la remplacer
                // supprimerait le seul chemin vers « nouvelle » de cet écran.
                <button type="button" className="om-row om-row-create" onClick={() => setDraft(EMPTY_DRAFT)}>
                  <span className="om-row-mark">
                    <PlusIcon size={15} />
                  </span>
                  <span className="om-row-main">
                    <span className="om-row-name">Nouvelle compétence</span>
                    <span className="om-row-sub">Un prompt réutilisable</span>
                  </span>
                </button>
              )}
              {filtered.map((c) => {
                const p = {
                  competence: c,
                  selected: draft?.id === c.id,
                  onEdit: () => setDraft(competenceToDraft(c)),
                  onUse: () => onUse(c),
                  onTogglePin: () => onTogglePin(c.id),
                  scope: orgBlock ? "personal" : undefined,
                  onShare: onShareCompetence ? () => onShareCompetence(c) : undefined,
                };
                return view === "list" ? <CompetenceRow key={c.id} {...p} /> : <CompetenceCard key={c.id} {...p} />;
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
            Annuler
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
          <CompetenceModal
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
