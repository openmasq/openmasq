import { BRAND } from "@openmasq/branding";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "../../containers/shell/PageHeader";
import { MemoryIcon, EmptyState, PlusIcon, Switch } from "../../components/brand";
import { MEMORY_CATEGORIES, newCardEntity, memoryCategoryLabel } from "../../memory";
import { buildMemoryGraph } from "../../memory/graph";
import { buildClusteredGraph } from "../../memory/cluster";
import { memoryExportFilename, memoryExportText } from "../../memory/memoryExport";
import { memoryUsageIndex } from "../../memory/usage";
import { downloadTextFile } from "../../components/export/documentExport";
import { useMemoryIndex } from "../../state/useMemoryIndex";
import { MemoryGraph } from "./MemoryGraph";
import { matchingCardIds } from "../../memory";
import { MemoryList, MemoryToolbar } from "./MemoryList";
import { MemoryProfile } from "./MemoryProfile";
import { MemoryNodePanel } from "./MemoryNodePanel";
import { MemoryMergeHint, MemoryPageMenu, MemoryUndoToast } from "./parts";
import { useMemoryReview } from "./useMemoryReview";
import type { Conversation, MemoryCard, MemoryData } from "../../types";

import { useT } from "../../i18n";
/**
 * The MÉMOIRE page — the kit's GRAPH design over the real store: core → category hubs →
 * one leaf per entity card, with the REAL cross-links (a card whose facts mention
 * another entity draws the edge). Click a node → the side panel edits it. The profile
 * and the auto-extraction opt-in keep their place above the graph — they are feature
 * controls, not decoration. The review flow (« À revoir », delete undo) lives in
 * `useMemoryReview`; the small chrome (⋯ menu, merge card, undo toast) in `parts.tsx`.
 */
export function MemoryView({
  memoire,
  conversations,
  requestedId,
  memoryAuto,
  onToggleAuto,
  onSetProfile,
  onAdd,
  onUpdate,
  onRemove,
  onRestore,
  onMerge,
  onToggleSidebar,
  loaded = true,
}: {
  memoire: MemoryData;
  /** For usage ("recalled in N conversations") — read only, never mutated here. */
  conversations?: readonly Conversation[];
  /** Deep-link from a chat caption: focus this card's node. The `n` nonce re-focuses
   *  the SAME card twice (mirrors the Compétences deep-link). */
  requestedId?: { id: string; n: number } | null;
  memoryAuto: boolean;
  onToggleAuto: (on: boolean) => void;
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
  // Search + Graph/List toggle: the graph makes you UNDERSTAND (the links), the list
  // makes you FIND — at 50+ cards, finding the one to fix is a scan, not a glance.
  const [view, setView] = useState<"graph" | "list">("graph");
  const [query, setQuery] = useState("");
  // The LEGEND filters (the page's most obvious affordance) — clicking a
  // category narrows the list and fades the graph, just like search.
  const [catFilter, setCatFilter] = useState<string | null>(null);
  const [grouped, setGrouped] = useState(false);
  // Semantic edges from the on-device index (desktop). Present ⇒ the CLUSTERED view
  // (groups by meaning, the embedder's whole point); absent ⇒ the category radial.
  const { edges: semEdges } = useMemoryIndex(memoire);
  // « À revoir » + le filet de suppression — la logique du flux de revue.
  const review = useMemoryReview(memoire, semEdges, { onUpdate, onRemove, onRestore, onMerge });
  const matched = useMemo(() => {
    let ids: Set<string> | null = matchingCardIds(memoire, query);
    if (catFilter) {
      const inCat = new Set(memoire.cards.filter((c) => c.cat === catFilter).map((c) => c.id));
      ids = ids ? new Set([...ids].filter((id) => inCat.has(id))) : inCat;
    }
    if (!review.fresh || !review.freshIds.size) return ids;
    return ids ? new Set([...ids].filter((id) => review.freshIds.has(id))) : review.freshIds;
  }, [memoire, query, catFilter, review.fresh, review.freshIds]);
  // L'usage réel, depuis les traces persistées des envois (`memoryUsed`/`memorySkipped`
  // sur les messages) — ce qui rend la valeur de la mémoire VISIBLE sur la page.
  const usage = useMemo(() => memoryUsageIndex(conversations ?? []), [conversations]);
  // Chat-caption deep-link → select that card's node (opens its side panel).
  useEffect(() => {
    if (requestedId) setSelected(`card-${requestedId.id}`);
  }, [requestedId]);
  const clustered = useMemo(
    () => (semEdges ? buildClusteredGraph(memoire, semEdges, t) : null),
    [memoire, semEdges, t],
  );
  const graph = useMemo(() => clustered ?? buildMemoryGraph(memoire, t), [clustered, memoire, t]);
  const selNode = graph.nodes.find((n) => n.id === selected) ?? null;
  const selCard = selNode?.cardId ? memoire.cards.find((c) => c.id === selNode.cardId) ?? null : null;
  const legend = MEMORY_CATEGORIES.filter((c) => memoire.cards.some((k) => k.cat === c.id));

  // DEBUG export: the cards AND the semantic links, as a local text file. The links are
  // what a clustering/dedupe question turns on, and they are invisible on screen.
  const exportDebug = () => {
    downloadTextFile(
      memoryExportFilename(),
      "text/plain;charset=utf-8",
      memoryExportText({ memoire, edges: semEdges ?? null }),
    );
  };

  // Nom UNIQUE à chaque création : `autoCleanMemory` fusionne d'office deux fiches de
  // même catégorie qui partagent une clé — un placeholder au nom FIXE s'auto-détruisait.
  const addCard = () => {
    const card = onAdd({ entity: newCardEntity(memoire.cards), facts: "", cat: "personne" });
    if (card) setSelected(`card-${card.id}`);
  };

  // UN panneau pour les deux vues (éditer, historique, connexions) — la liste et le
  // graphe sélectionnent le même id de nœud, le panneau ne fork jamais.
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
          <div className="om-mem-actions">
            <MemoryPageMenu onExport={exportDebug} />
            <button type="button" className="btn-primary om-skill-new" onClick={addCard}>
              {/* Une seule promesse : ce geste crée une fiche. Le graphe ne relie
                  que sur une MENTION dans les faits, jamais sur une création. */}
              <PlusIcon size={16} />
              {t.lists.memory.newCard}
            </button>
          </div>
        }
      />

      <div className="library-body">
        <div className="om-skill-inner">
          <MemoryProfile memoire={memoire} onSetProfile={onSetProfile} />

          <div className="om-skill-filters">
            <label className="om-mem-auto">
              <Switch checked={memoryAuto} onChange={onToggleAuto} />
              {/* La GARANTIE reste, le mot « redacted » part : sur cette page le
                  redaction n'est pas le sujet, mais « est-ce que ça fait sortir plus de
                  mes données ? » est exactement la question qu'un interrupteur
                  d'extraction automatique pose. Ne retirez pas la seconde phrase. */}
              <span>
                Extraction automatique — {BRAND.name} note seul les faits durables. Rien de nouveau ne
                quitte votre machine.
              </span>
            </label>
            <span className="om-skill-spacer" />
            {/* La légende FILTRE — un clic sur une catégorie restreint la liste et
                estompe le graphe, exactement comme la recherche (même `matched`). */}
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

          {memoire.cards.length > 0 && (
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

          {/* Le doublon vit dans la boîte « À revoir » : compté dans son chip, montré
              sous son filtre — jamais une bannière qui pousse la page à chaque visite. */}
          {review.fresh && review.mergeHint && (
            <MemoryMergeHint
              hint={review.mergeHint}
              cardOf={(id) => memoire.cards.find((c) => c.id === id)}
              onMerge={() => {
                onMerge?.(review.mergeHint!.keepId, review.mergeHint!.dropId);
                setSelected(`card-${review.mergeHint!.keepId}`);
              }}
              onDismiss={() => review.dismissMerge(review.mergeHint!)}
            />
          )}

          {memoire.cards.length === 0 && !memoire.profile?.trim() && !loaded ? (
            <div className="library-empty">{t.lists.loading}</div>
          ) : memoire.cards.length === 0 && !memoire.profile?.trim() ? (
            // Les trois points disent déjà la forme, le geste et le bénéfice : le corps ne
            // les répète pas, il ne garde que les exemples et le régime au repos.
            // ⚠️ Pas « tout reste sur votre machine » : une fiche part sur les autres
            // appareils dès que la synchro est active (`packages/sync/src/userdata.ts`).
            // Chiffrée, elle, l'est toujours — ici retirée de l'instantané en clair
            // (`useMemory.ts`), et de bout en bout en transit.
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
                memoire={memoire}
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
              {/* La légende des TRAITS — sans elle, plein/pointillé est un code privé.
                  Le trait sémantique n'est listé que quand la vue le dessine. */}
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
                  ? `Graphe sémantique · ${clustered.clusters.length} groupe${clustered.clusters.length > 1 ? "s" : ""} · ${graph.nodes.length} nœuds`
                  : `Graphe de mémoire · ${graph.nodes.length} nœuds`}
              </div>
              {panel}
            </div>
          )}
        </div>
      </div>

      {review.undo && onRestore && <MemoryUndoToast undo={review.undo} onRestore={review.restoreUndo} />}
    </main>
  );
}
