import { useEffect, useState } from "react";
import { useHost } from "../../host";
import { cardEmbedText, type SemanticEdge } from "../../memory/cluster";
import type { MemoryData } from "../../types";

/**
 * The MÉMOIRE semantic index, renderer side: keep the host's on-device embedding cache
 * in step with the cards (debounced — a card edit re-embeds once, not per keystroke)
 * and hand back the kNN cosine edges the clustered view consumes.
 *
 * `edges === null` = no semantic view (host slot absent, bundle not baked, <2 cards,
 * or the index errored) — the Mémoire page then renders the category graph, quietly
 * (an optional host slot's absence is a normal state, not an error).
 */
export function useMemoryIndex(memoryData: MemoryData | undefined): { edges: SemanticEdge[] | null } {
  const host = useHost();
  const [edges, setEdges] = useState<SemanticEdge[] | null>(null);

  useEffect(() => {
    const index = host.memoryIndex;
    const cards = memoryData?.cards ?? [];
    if (!index || cards.length < 2) {
      setEdges(null);
      return;
    }
    let alive = true;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const state = await index.sync(cards.map((c) => ({ id: c.id, text: cardEmbedText(c) })));
          if (!alive) return;
          if (!state.available) {
            setEdges(null);
            return;
          }
          const next = await index.edges(3);
          if (alive) setEdges(next);
        } catch {
          if (alive) setEdges(null); // degrade to the category graph — never crash the page
        }
      })();
    }, 800);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [host, memoryData]);

  return { edges };
}
