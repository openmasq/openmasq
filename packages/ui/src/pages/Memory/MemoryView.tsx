import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "../../containers/shell/PageHeader";
import { MemoryIcon, EmptyState, PlusIcon } from "../../components/brand";
import { MEMORY_CATEGORIES, newCardEntity, memoryCategoryLabel } from "../../memory";
import { buildMemoryGraph } from "../../memory/graph";
import { buildClusteredGraph } from "../../memory/cluster";
import { memoryUsageIndex } from "../../memory/usage";
import { useMemoryIndex } from "../../state/memory/useMemoryIndex";
import { useViewMode } from "../../hooks/useViewMode";
import { MemoryGraph } from "./MemoryGraph";
import { matchingCardIds } from "../../memory";
import { MemoryList, MemoryToolbar } from "./MemoryList";
import { MemoryProfile } from "./MemoryProfile";
import { MemoryNodePanel } from "./MemoryNodePanel";
import { MemoryMergeHint, MemoryUndoToast } from "./parts";
import { useMemoryReview } from "./useMemoryReview";
import type { Conversation, MemoryCard, MemoryData } from "../../types";

import { useT } from "../../i18n";
/**
 * The MÉMOIRE page: the profile, a search, « À revoir », the LIST (default) or the kit's
 * GRAPH — core → category hubs → one leaf per entity card, with the REAL cross-links (a
 * card whose facts mention another entity draws the edge) — and « Nouvelle fiche ».
 * Click a row or a node → the side panel edits it; its « Connexions » reach the graph
 * from the list. The page carries NO setting: the silent extraction's switch lives in
 * Réglages → Confidentialité, and the diagnostic export in Réglages → Journal — a page
 * that files what you know is not where one tunes what the machine does. The review
 * flow (« À revoir », delete undo) lives in `useMemoryReview`; the small chrome (merge
 * card, undo toast) in `parts.tsx`.
 */
export function MemoryView({
  memoryData,
  conversations,
  requestedId,
  onSetProfile,
  onAdd,
  onUpdate,
  onRemove,
  onRestore,
  onMerge,
  onToggleSidebar,
  loaded = true,
}: {
  memoryData: MemoryData;
  /** For usage ("recalled in N conversations") — read only, never mutated here. */
  conversations?: readonly Conversation[];
  /** Deep-link from a chat caption: focus this card's node. The `n` nonce re-focuses
   *  the SAME card twice (mirrors the Compétences deep-link). */
  requestedId?: { id: string; n: number } | null;
  onSetProfile: (profile: string) => void;
  /** Returns the created card so the graph can select it for immediate rename. */
  onAdd: (input: { entity: string; facts: string; cat?: string; aliases?: string[] }) => MemoryCard | null;
  onUpdate: (id: string, patch: Partial<Omit<MemoryCard, "id" | "createdAt">>) => void;
  onRemove: (id: string) => void;
  /** Re-inserts a deleted card AS-IS (same id) — the toast's « Annuler ». */
  onRestore?: (card: MemoryCard) => void;
  /** Confirmed duplicate merge — `state/useMemory.ts` `mergeMemoryCards`. */
  onMerge?: (keepId: string, dropId: string) => void;
  onToggleSidebar?: () => void;
  /** False only during the initial per-account load — see `VaultView`'s doc on the
   *  same prop for why an empty memory then must read as "loading", not "empty". */
  loaded?: boolean;
}) {
  const t = useT();
  const [selected, setSelected] = useState<string | null>(null);
  // Graph (default) ⇄ list, remembered per screen like the Bibliothèque's grid ⇄ list:
  // the graph makes you UNDERSTAND (the links), the list makes you FIND — at 50+
  // cards, finding the one to fix is a scan, not a glance.
  const [view, setView] = useViewMode("memory");
  const [query, setQuery] = useState("");
  // The LEGEND filters (the page's most obvious affordance) — clicking a
  // category narrows the list and fades the graph, just like search.
  const [catFilter, setCatFilter] = useState<string | null>(null);
  const [grouped, setGrouped] = useState(false);
  // Semantic edges from the on-device index (desktop). Present ⇒ the CLUSTERED view
  // (groups by meaning, the embedder's whole point); absent ⇒ the category radial.
  const { edges: semEdges } = useMemoryIndex(memoryData);
  // "À revoir" + the delete safety net — the review-flow logic.
  const review = useMemoryReview(memoryData, semEdges, { onUpdate, onRemove, onRestore, onMerge });
  const matched = useMemo(() => {
    let ids: Set<string> | null = matchingCardIds(memoryData, query);
    if (catFilter) {
      const inCat = new Set(memoryData.cards.filter((c) => c.cat === catFilter).map((c) => c.id));
      ids = ids ? new Set([...ids].filter((id) => inCat.has(id))) : inCat;
    }
    if (!review.fresh || !review.freshIds.size) return ids;
    return ids ? new Set([...ids].filter((id) => review.freshIds.has(id))) : review.freshIds;
  }, [memoryData, query, catFilter, review.fresh, review.freshIds]);
  // The real usage, from the persisted send traces (`memoryUsed`/`memorySkipped`
  // on the messages) — what makes the Mémoire's value VISIBLE on the page.
  const usage = useMemo(() => memoryUsageIndex(conversations ?? []), [conversations]);
  // Chat-caption deep-link → select that card's node (opens its side panel).
  useEffect(() => {
    if (requestedId) setSelected(`card-${requestedId.id}`);
  }, [requestedId]);
  const clustered = useMemo(
    () => (semEdges ? buildClusteredGraph(memoryData, semEdges, t) : null),
    [memoryData, semEdges, t],
  );
  const graph = useMemo(() => clustered ?? buildMemoryGraph(memoryData, t), [clustered, memoryData, t]);
  const selNode = graph.nodes.find((n) => n.id === selected) ?? null;
  const selCard = selNode?.cardId ? memoryData.cards.find((c) => c.id === selNode.cardId) ?? null : null;
  const legend = MEMORY_CATEGORIES.filter((c) => memoryData.cards.some((k) => k.cat === c.id));

  // UNIQUE name on every creation: `autoCleanMemory` automatically merges two cards of the
  // same category that share a key — a placeholder with a FIXED name would self-destruct.
  const addCard = () => {
    const card = onAdd({ entity: newCardEntity(memoryData.cards), facts: "", cat: "personne" });
    if (card) setSelected(`card-${card.id}`);
  };

  // ONE panel for both views (edit, history, connections) — the list and the
  // graph select the same node id, the panel never forks.
  const panel = selNode && (
    <MemoryNodePanel
      node={selNode}
      graph={graph}
      card={selCard}
      usage={selCard ? usage.get(selCard.id) ?? null : null}
      fresh={!!selCard && review.freshIds.has(selCard.id)}
      onConfirm={review.confirmCard}
      onSelect={setSelected}
      onClose={() => setSelected(null)}
      onUpdate={onUpdate}
      onRemove={(id) => {
        review.removeWithUndo(id);
        setSelected(null);
      }}
    />
  );

  return (
    <main className="library-page">
      <PageHeader
        section="memory"
        onToggleSidebar={onToggleSidebar}
        action={
          // The « Créer » of the four pages lives HERE, in the header — one place,
          // whatever the screen. A single promise: this action creates a card; the
          // graph only links on a MENTION in the facts, never on a creation.
          <button type="button" className="btn-primary om-skill-new" onClick={addCard}>
            <PlusIcon size={16} />
            {t.lists.memory.newCard}
          </button>
        }
      />

      <div className="library-body">
        <div className="om-skill-inner">
          <MemoryProfile memoryData={memoryData} onSetProfile={onSetProfile} />

          {/* The legend FILTERS — clicking a category narrows the list and fades
              the graph, exactly like search (same `matched`). Only once there is
              something to filter. */}
          {legend.length > 0 && (
          <div className="om-skill-filters">
            {legend.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`om-mem-legend${catFilter === c.id ? " on" : ""}`}
                aria-pressed={catFilter === c.id}
                title={catFilter === c.id ? t.lists.memory.clearFilter : t.lists.memory.onlyShow(memoryCategoryLabel(c.id, t))}
                onClick={() => setCatFilter((cur) => (cur === c.id ? null : c.id))}
              >
                <span className="om-mem-dot-chip sm" style={{ background: `var(--hl-${c.tone})` }} />
                {memoryCategoryLabel(c.id, t)}
              </button>
            ))}
          </div>
          )}

          {memoryData.cards.length > 0 && (
            <MemoryToolbar
              query={query}
              onQuery={setQuery}
              view={view}
              onView={setView}
              reviewCount={review.reviewCount}
              fresh={review.fresh}
              onFresh={review.setFresh}
              grouped={grouped}
              onGrouped={setGrouped}
            />
          )}

          {/* The duplicate lives in the "À revoir" box: counted in its chip, shown
              under its filter — never a banner that pushes the page down on every visit. */}
          {review.fresh && review.mergeHint && (
            <MemoryMergeHint
              hint={review.mergeHint}
              cardOf={(id) => memoryData.cards.find((c) => c.id === id)}
              onMerge={() => {
                onMerge?.(review.mergeHint!.keepId, review.mergeHint!.dropId);
                setSelected(`card-${review.mergeHint!.keepId}`);
              }}
              onDismiss={() => review.dismissMerge(review.mergeHint!)}
            />
          )}

          {memoryData.cards.length === 0 && !memoryData.profile?.trim() && !loaded ? (
            <div className="library-empty">{t.lists.loading}</div>
          ) : memoryData.cards.length === 0 && !memoryData.profile?.trim() ? (
            // The three bullet points already say the shape, the action and the benefit: the body
            // doesn't repeat them, it only keeps the examples and the at-rest regime.
            // ⚠️ Not "everything stays on your machine": a card goes out to other
            // devices as soon as sync is active (`packages/sync/src/userdata.ts`).
            // Encrypted, though, it always is — here removed from the in-clear snapshot
            // (`useMemory.ts`), and end-to-end in transit.
            <EmptyState
              tone="violet"
              eyebrow={t.sections.memory.label}
              icon={<MemoryIcon size={26} />}
              title={t.lists.memory.empty.title}
              body={t.lists.memory.empty.body}
              points={[
                { glyph: "◆", label: t.lists.memory.empty.points[0], tone: "violet" },
                { glyph: "✦", label: t.lists.memory.empty.points[1], tone: "sky" },
                { glyph: "◈", label: t.lists.memory.empty.points[2], tone: "lime" },
              ]}
              cta={t.lists.memory.empty.cta}
              ctaIcon={<PlusIcon size={16} />}
              onCta={addCard}
            />
          ) : view === "list" ? (
            <div className="om-mem-listwrap">
              <MemoryList
                memoryData={memoryData}
                matched={matched}
                freshIds={review.freshIds}
                grouped={grouped}
                selectedCardId={selCard?.id ?? null}
                onSelect={setSelected}
                onConfirm={review.confirmCard}
                onRemove={review.removeWithUndo}
              />
              {selNode?.cardId && panel}
            </div>
          ) : (
            <div className="om-mem-stage">
              <MemoryGraph graph={graph} selected={selected} matched={matched} onSelect={setSelected} />
              {/* The STROKE legend — without it, solid/dashed is a private code.
                  The semantic stroke is only listed when the view draws it. */}
              <div className="om-mem-edge-legend">
                <span className="om-mem-edge-key">
                  <span className="om-mem-edge-swatch cat" />
                  {t.lists.memory.legend.category}
                </span>
                <span className="om-mem-edge-key" title={t.lists.memory.legend.mentionTip}>
                  <span className="om-mem-edge-swatch cross" />
                  {t.lists.memory.legend.mention}
                </span>
                {clustered && (
                  <span className="om-mem-edge-key" title={t.lists.memory.legend.sameTopicTip}>
                    <span className="om-mem-edge-swatch sem" />
                    {t.lists.memory.legend.sameTopic}
                  </span>
                )}
              </div>
              <div className="cv-eyebrow om-mem-stage-count">
                {clustered
                  ? t.lists.memory.stageCountSemantic(clustered.clusters.length, graph.nodes.length)
                  : t.lists.memory.stageCount(graph.nodes.length)}
              </div>
              {panel}
            </div>
          )}
        </div>
      </div>

      {review.undo && onRestore && <MemoryUndoToast undo={review.undo} onRestore={review.restoreUndo} onDone={review.dismissUndo} />}
    </main>
  );
}
