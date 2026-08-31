import type { Messages } from "@openmasq/i18n";
import type { MemoryCard, MemoryData } from "../types";
import { MEMORY_CATEGORIES, memoryCategory } from "./memory";
import { crossLinks, type GraphEdge, type GraphNode, type MemoryGraphData } from "./graph";

/**
 * The CLUSTERED Mémoire — the semantic grouping the on-device embedder unlocks. Pure:
 * the vectors never reach the renderer; the host hands over kNN cosine EDGES
 * (`host.memoryIndex.edges`) and this file turns them into clusters + the same
 * `MemoryGraphData` shape the SVG renderer already draws (core → GROUP hubs → leaves),
 * so `MemoryGraph.tsx` needs no new renderer. Clusters union BOTH signals: a semantic
 * edge above the threshold AND an explicit mention cross-link — a card whose facts
 * name another entity belongs with it even when the embedder is unsure.
 */

export interface SemanticEdge {
  a: string;
  b: string;
  /** Cosine similarity (vectors are L2-normalized). */
  sim: number;
}

/**
 * The clustering threshold for e5 cosine, CALIBRATED on the shipped q8 export with an
 * adversarial corpus (scratchpad `e5/cluster-eval.ts`): genuinely related cards sit
 * ≥ ~0.926, while GENERIC-vocabULARY bridges — « site web » linking a host to a design
 * project, « renouvellement » linking a domain to a passport — reach 0.910-0.914. 0.92
 * sits between the two regimes (eval: 0 wrong merges; the cost is missing weak true
 * pairs, which the MENTION union mostly recovers). ⚠️ The margin is thin (~±0.006) and
 * export-specific — re-run the eval if `EMBED_MODEL_TAG` changes.
 */
export const CLUSTER_MIN_SIM = 0.92;

/**
 * Two PERSONNE cards need a HIGHER bar to merge on semantics alone: two different
 * people with template-similar facts (« Client, préfère les points le jeudi » /
 * « Cliente, préfère les points le vendredi ») measured 0.945 — semantic similarity of
 * short habit-facts is NOT evidence they belong together. Real person-groupings come
 * from a shared org/project (a MENTION union, unaffected) or near-duplicate cards of
 * the SAME person, which sit ≥ ~0.95.
 */
export const PERSON_PAIR_MIN_SIM = 0.95;

/** The semantic edges that COUNT — one rule for the union AND the drawn dashed edges,
 *  so the picture never shows a link the clustering ignored (or vice-versa). */
export function strongSemEdges(
  cards: MemoryCard[],
  semEdges: SemanticEdge[],
  minSim = CLUSTER_MIN_SIM,
): SemanticEdge[] {
  const catOf = new Map(cards.map((c) => [c.id, c.cat]));
  return semEdges.filter((e) => {
    const bar =
      catOf.get(e.a) === "personne" && catOf.get(e.b) === "personne"
        ? Math.max(minSim, PERSON_PAIR_MIN_SIM)
        : minSim;
    return e.sim >= bar;
  });
}

export interface MemoryCluster {
  id: string;
  /** The most-connected member's entity — the group's human name. */
  label: string;
  /** Dominant member category tone (the legend's vocabulary). */
  tone: string;
  cardIds: string[];
}

/** Union-find over (semantic ≥ minSim) ∪ mention edges. Returns clusters of ≥2 cards,
 *  biggest first; singletons are NOT clusters (the layout floats them separately). */
export function buildClusters(
  cards: MemoryCard[],
  semEdges: SemanticEdge[],
  minSim = CLUSTER_MIN_SIM,
): MemoryCluster[] {
  const parent = new Map<string, string>(cards.map((c) => [c.id, c.id]));
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(x, r);
    return r;
  };
  const union = (a: string, b: string): void => {
    if (!parent.has(a) || !parent.has(b)) return;
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  const strong = strongSemEdges(cards, semEdges, minSim);
  for (const e of strong) union(e.a, e.b);
  for (const [a, b] of crossLinks(cards)) union(a, b);

  const groups = new Map<string, string[]>();
  for (const c of cards) {
    const r = find(c.id);
    groups.set(r, [...(groups.get(r) ?? []), c.id]);
  }

  // Degree in the strong-edge subgraph — the most-connected member names the group.
  const degree = new Map<string, number>();
  for (const e of strong) {
    degree.set(e.a, (degree.get(e.a) ?? 0) + 1);
    degree.set(e.b, (degree.get(e.b) ?? 0) + 1);
  }
  const byId = new Map(cards.map((c) => [c.id, c]));

  return [...groups.values()]
    .filter((ids) => ids.length >= 2)
    .map((ids, i) => {
      const members = ids.map((id) => byId.get(id)!).filter(Boolean);
      const rep = [...members].sort(
        (a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0) || b.updatedAt - a.updatedAt,
      )[0];
      const counts = new Map<string, number>();
      for (const m of members) counts.set(m.cat, (counts.get(m.cat) ?? 0) + 1);
      const domCat = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
      const tone =
        MEMORY_CATEGORIES.find((c) => c.id === domCat)?.tone ?? memoryCategory(domCat).tone;
      return { id: `cl-${i}`, label: rep.entity, tone, cardIds: ids };
    })
    .sort((a, b) => b.cardIds.length - a.cardIds.length);
}

export interface ClusteredGraphData extends MemoryGraphData {
  clusters: MemoryCluster[];
}

const HUB_R = 10;
const OUTER_R = 13.5;

/**
 * The clustered layout, same node/edge vocabulary as the radial category graph:
 * core → one GROUP hub per cluster (leaves ringed around it) + unclustered singleton
 * leaves on an outer ring. Semantic edges ≥ threshold render dashed (`sem`), the
 * mention cross-links keep their `cross` style. Deterministic — same data, same picture.
 */
export function buildClusteredGraph(
  memory: MemoryData,
  semEdges: SemanticEdge[],
  t: Messages,
  minSim = CLUSTER_MIN_SIM,
): ClusteredGraphData {
  const clusters = buildClusters(memory.cards, semEdges, minSim);
  const clustered = new Set(clusters.flatMap((c) => c.cardIds));
  const singles = memory.cards.filter((c) => !clustered.has(c.id));
  const byId = new Map(memory.cards.map((c) => [c.id, c]));

  const nodes: GraphNode[] = [
    { id: "core", label: t.lists.memory.coreNode, kind: "core", tone: "core", size: 20, x: 0, y: 0 },
  ];
  const edges: GraphEdge[] = [];

  const hubCount = clusters.length + (memory.profile?.trim() ? 1 : 0);
  let gi = 0;
  const hubAngle = () => (gi / Math.max(1, hubCount)) * Math.PI * 2 - Math.PI / 2;

  if (memory.profile?.trim()) {
    const a = hubAngle();
    gi++;
    nodes.push({
      id: "profil",
      label: t.lists.memory.profileNode,
      kind: "hub",
      tone: "mint",
      size: 13,
      x: Math.cos(a) * HUB_R,
      y: Math.sin(a) * HUB_R,
    });
    edges.push({ source: "core", target: "profil" });
  }

  for (const cl of clusters) {
    const a = hubAngle();
    gi++;
    const hx = Math.cos(a) * HUB_R;
    const hy = Math.sin(a) * HUB_R;
    nodes.push({
      id: cl.id,
      label: cl.label,
      kind: "hub",
      tone: cl.tone,
      size: 11 + Math.min(4, cl.cardIds.length),
      x: hx,
      y: hy,
      group: true,
    });
    edges.push({ source: "core", target: cl.id });
    const ringR = 2.4 + Math.min(1.6, cl.cardIds.length * 0.18);
    cl.cardIds.forEach((cardId, li) => {
      const card = byId.get(cardId)!;
      const la = a + (li / cl.cardIds.length) * Math.PI * 2;
      nodes.push({
        id: `card-${cardId}`,
        label: card.entity,
        kind: "leaf",
        tone: memoryCategory(card.cat).tone,
        size: 7,
        x: hx + Math.cos(la) * ringR,
        y: hy + Math.sin(la) * ringR,
        cardId,
      });
      edges.push({ source: cl.id, target: `card-${cardId}` });
    });
  }

  // Unclustered cards: an outer ring, tethered to the core — present, not grouped.
  singles.forEach((card, i) => {
    const a = (i / Math.max(1, singles.length)) * Math.PI * 2 - Math.PI / 2 + 0.2;
    nodes.push({
      id: `card-${card.id}`,
      label: card.entity,
      kind: "leaf",
      tone: memoryCategory(card.cat).tone,
      size: 7,
      x: Math.cos(a) * OUTER_R,
      y: Math.sin(a) * OUTER_R,
      cardId: card.id,
    });
    edges.push({ source: "core", target: `card-${card.id}` });
  });

  for (const e of strongSemEdges(memory.cards, semEdges, minSim)) {
    edges.push({ source: `card-${e.a}`, target: `card-${e.b}`, sem: true });
  }
  for (const [a, b] of crossLinks(memory.cards)) {
    edges.push({ source: `card-${a}`, target: `card-${b}`, cross: true });
  }
  return { nodes, edges, clusters };
}

/** The card's embeddable surface — what `host.memoryIndex.sync` hashes and embeds.
 *  One definition (rule 9): the hook and any future recall pass must agree, or the
 *  cache invalidates on every send. */
export function cardEmbedText(card: MemoryCard): string {
  const aliases = card.aliases?.length ? ` (${card.aliases.join(", ")})` : "";
  return `${card.entity}${aliases}. ${card.facts}`.trim();
}
