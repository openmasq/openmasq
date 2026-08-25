import type { MemoryCard, MemoryData } from "../types";
import { MEMORY_CATEGORIES, cardKeys, memoryCategory, normalizeMem } from "./memory";

/**
 * The Mémoire GRAPH — the kit's radial layout (core → category hubs → card leaves),
 * derived from the REAL store. Pure math, no renderer: the kit draws it with sigma over
 * a CDN, which the app forbids (CSP + rule 7) — the app renders this same layout as
 * plain SVG (`pages/Memory/MemoryGraph.tsx`).
 *
 * The one thing the kit's mock cannot have: REAL cross-links. Two cards are connected
 * when one's FACTS (or aliases) mention the other's entity — « Augustin Vaudel : contact
 * chez Karl Studio » draws the Augustin↔Karl edge. That is the graph's actual value:
 * it shows the relational structure of what the app knows, not a decoration.
 */

export interface GraphNode {
  id: string;
  label: string;
  kind: "core" | "hub" | "leaf";
  /** `--hl-*` tone (hue token, resolved by the renderer) — "core" for the root. */
  tone: string;
  size: number;
  x: number;
  y: number;
  /** The backing card (leaves only). */
  cardId?: string;
  /** A SEMANTIC-cluster hub (the clustered view) — labeled « Groupe », not « Catégorie ». */
  group?: boolean;
}

export interface GraphEdge {
  source: string;
  target: string;
  /** Structural (core↔hub↔leaf) or a REAL cross-link between two cards. */
  cross?: boolean;
  /** A SEMANTIC edge (embedding cosine ≥ the cluster threshold) — rendered dashed. */
  sem?: boolean;
}

export interface MemoryGraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

const HUB_R = 10;
const LEAF_R = 3.6;

/** Cross-links: card A → card B when A's facts or aliases mention B's entity. */
export function crossLinks(cards: MemoryCard[]): [string, string][] {
  const out: [string, string][] = [];
  for (const a of cards) {
    const hay = ` ${normalizeMem(`${a.facts} ${(a.aliases ?? []).join(" ")}`)} `;
    for (const b of cards) {
      if (a.id === b.id) continue;
      const hit = cardKeys(b).some((k) => k.length >= 3 && hay.includes(` ${k} `));
      if (hit && !out.some(([x, y]) => (x === b.id && y === a.id) || (x === a.id && y === b.id))) {
        out.push([a.id, b.id]);
      }
    }
  }
  return out;
}

/** Build the radial graph from the store. Deterministic — same data, same picture. */
export function buildMemoryGraph(memory: MemoryData): MemoryGraphData {
  const nodes: GraphNode[] = [
    { id: "core", label: "Mémoire", kind: "core", tone: "core", size: 20, x: 0, y: 0 },
  ];
  const edges: GraphEdge[] = [];

  // Hubs: only the categories that HOLD something (+ the profile, when set) — an empty
  // hub is noise, not structure.
  const groups = MEMORY_CATEGORIES.map((cat) => ({
    cat,
    cards: memory.cards.filter((c) => c.cat === cat.id),
  })).filter((g) => g.cards.length > 0);
  const hubCount = groups.length + (memory.profile?.trim() ? 1 : 0);

  let gi = 0;
  const hubAngle = () => (gi / Math.max(1, hubCount)) * Math.PI * 2 - Math.PI / 2;

  if (memory.profile?.trim()) {
    const a = hubAngle();
    gi++;
    nodes.push({
      id: "profil",
      label: "Profil",
      kind: "hub",
      tone: "mint",
      size: 13,
      x: Math.cos(a) * HUB_R,
      y: Math.sin(a) * HUB_R,
    });
    edges.push({ source: "core", target: "profil" });
  }

  for (const g of groups) {
    const a = hubAngle();
    gi++;
    const hx = Math.cos(a) * HUB_R;
    const hy = Math.sin(a) * HUB_R;
    const hid = `hub-${g.cat.id}`;
    nodes.push({ id: hid, label: g.cat.label, kind: "hub", tone: g.cat.tone, size: 13, x: hx, y: hy });
    edges.push({ source: "core", target: hid });
    g.cards.forEach((card, li) => {
      const la = a + (li - (g.cards.length - 1) / 2) * 0.5;
      nodes.push({
        id: `card-${card.id}`,
        label: card.entity,
        kind: "leaf",
        tone: memoryCategory(card.cat).tone,
        size: 7,
        x: hx + Math.cos(la) * LEAF_R,
        y: hy + Math.sin(la) * LEAF_R,
        cardId: card.id,
      });
      edges.push({ source: hid, target: `card-${card.id}` });
    });
  }

  for (const [a, b] of crossLinks(memory.cards)) {
    edges.push({ source: `card-${a}`, target: `card-${b}`, cross: true });
  }
  return { nodes, edges };
}

/** The neighbour set of a node (for the selection highlight). */
export function neighborsOf(id: string, edges: GraphEdge[]): Set<string> {
  const out = new Set<string>();
  for (const e of edges) {
    if (e.source === id) out.add(e.target);
    if (e.target === id) out.add(e.source);
  }
  return out;
}
