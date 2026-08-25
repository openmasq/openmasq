import { BRAND } from "@openmasq/branding";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "../../containers/shell/PageHeader";
import { sectionSubtitle } from "../../help";
import { MemoryIcon, EmptyState, PlusIcon, Switch } from "../../components/brand";
import { MEMORY_CATEGORIES, newCardEntity } from "../../memory";
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
  /** Pour l'usage (« rappelée dans N conversations ») — lu seul, jamais muté ici. */
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
  /** Réinsère une fiche supprimée TELLE QUELLE (même id) — l'« Annuler » du toast. */
  onRestore?: (card: MemoryCard) => void;
  /** Confirmed duplicate merge — `state/useMemory.ts` `mergeMemoryCards`. */
  onMerge?: (keepId: string, dropId: string) => void;
  onToggleSidebar?: () => void;
  /** False only during the initial per-account load — see `VaultView`'s doc on the
   *  same prop for why an empty memory then must read as "loading", not "empty". */
  loaded?: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  // Recherche + bascule Graphe/Liste : le graphe fait COMPRENDRE (les liens), la liste
  // fait TROUVER — à 50+ fiches, retrouver celle à corriger est un scan, pas un survol.
  const [view, setView] = useState<"graph" | "list">("graph");
  const [query, setQuery] = useState("");
  // La LÉGENDE filtre (l'affordance la plus évidente de la page) — un clic sur une
  // catégorie restreint la liste et estompe le graphe, comme la recherche.
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
    () => (semEdges ? buildClusteredGraph(memoire, semEdges) : null),
    [memoire, semEdges],
  );
  const graph = useMemo(() => clustered ?? buildMemoryGraph(memoire), [clustered, memoire]);
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
        title="Mémoire"
        subtitle={sectionSubtitle("memory")}
        onToggleSidebar={onToggleSidebar}
        action={
          <div className="om-mem-actions">
            <MemoryPageMenu onExport={exportDebug} />
            <button type="button" className="btn-primary om-skill-new" onClick={addCard}>
              {/* Une seule promesse : ce geste crée une fiche. Le graphe ne relie
                  que sur une MENTION dans les faits, jamais sur une création. */}
              <PlusIcon size={16} />
              Nouvelle fiche
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
                title={catFilter === c.id ? "Retirer le filtre" : `Ne montrer que : ${c.label}`}
                onClick={() => setCatFilter((cur) => (cur === c.id ? null : c.id))}
              >
                <span className="om-mem-dot-chip sm" style={{ background: `var(--hl-${c.tone})` }} />
                {c.label}
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
            <div className="library-empty">Chargement…</div>
          ) : memoire.cards.length === 0 && !memoire.profile?.trim() ? (
            // Les trois points disent déjà la forme, le geste et le bénéfice : le corps ne
            // les répète pas, il ne garde que les exemples et le régime au repos.
            // ⚠️ Pas « tout reste sur votre machine » : une fiche part sur les autres
            // appareils dès que la synchro est active (`packages/sync/src/userdata.ts`).
            // Chiffrée, elle, l'est toujours — ici retirée de l'instantané en clair
            // (`useMemory.ts`), et de bout en bout en transit.
            <EmptyState
              tone="violet"
              eyebrow="Mémoire"
              icon={<MemoryIcon size={26} />}
              title="Une mémoire qui vous appartient."
              body="Notez les faits durables — un client, un projet, vos préférences. Ils sont chiffrés, et vous seul pouvez les lire."
              points={[
                { glyph: "◆", label: "Une fiche par personne ou projet", tone: "violet" },
                { glyph: "✦", label: "« Retiens que… » dans le chat", tone: "sky" },
                { glyph: "◈", label: "Rappelée quand elle est utile", tone: "lime" },
              ]}
              cta="Créer ma première fiche"
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
                  catégorie
                </span>
                <span className="om-mem-edge-key" title="Une fiche cite le nom (ou un alias) de l'autre dans ses faits — ajoutez ou retirez la mention pour créer ou défaire le lien.">
                  <span className="om-mem-edge-swatch cross" />
                  mention
                </span>
                {clustered && (
                  <span className="om-mem-edge-key" title="Deux fiches qui parlent de la même chose, rapprochées par l'analyse locale.">
                    <span className="om-mem-edge-swatch sem" />
                    même sujet
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
