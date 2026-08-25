import { isStopword } from "@openmasq/redact";
import type { MemoryData } from "../types";
import { memoryCategory, normalizeMem } from "./memory";
import { fmtDay } from "./select";

/**
 * `memory_search` — the model-PULLED path (agent turns), split from `select.ts`
 * (the injection-time cascade): pulling on demand and choosing what to inject are
 * two different questions over the same store. Both format a card line the same
 * way (entity, category label, facts, dated), both are re-redacted downstream.
 */

/** Plancher du rappel sémantique de `memory_search` — SOUS le seuil de clustering
 *  (`cluster.ts` CLUSTER_MIN_SIM = 0.92, calibré fiche↔fiche) : une REQUÊTE est plus
 *  courte qu'une fiche et cote plus bas, et le résultat de `memory_search` est un
 *  contexte que le modèle juge (re-redacted, borné), pas une décision — l'erreur penche
 *  vers le rappel. Marge nette sur la base e5 (~0.85 entre textes sans rapport). */
const SEARCH_MIN_SIM = 0.88;

/** `memory_search`, tier SÉMANTIQUE en plus du lexical : la question qui DÉCRIT une
 *  fiche sans la nommer (« mon client du secteur audio ») ne matchait aucun mot. Le
 *  lexical garde la priorité (exact bat proche) ; le sémantique complète jusqu'à `max`,
 *  au-dessus du plancher, via `host.memoryIndex.query` (embed sur l'appareil). Sans
 *  index (plateforme, bundle absent, erreur) : le lexical seul, comme avant. */
export async function searchMemoryHybrid(
  memory: MemoryData | undefined,
  query: string,
  semantic: ((text: string, k: number) => Promise<{ id: string; sim: number }[]>) | undefined,
  max = 4,
): Promise<string> {
  const lexical = searchMemoryStore(memory, query, max);
  if (!memory || !semantic) return lexical;
  const lines = lexical ? lexical.split("\n") : [];
  if (lines.length >= max) return lexical;
  let hits: { id: string; sim: number }[];
  try {
    hits = await semantic(query, max);
  } catch {
    return lexical; // l'index est un bonus — son erreur ne casse jamais la recherche
  }
  const have = new Set(lines);
  for (const h of hits) {
    if (lines.length >= max || h.sim < SEARCH_MIN_SIM) break; // trié par cosinus décroissant
    const card = memory.cards.find((c) => c.id === h.id);
    if (!card) continue;
    const line = `${card.entity} (${memoryCategory(card.cat).label.toLowerCase()}) : ${card.facts} (noté le ${fmtDay(card.updatedAt)})`;
    if (have.has(line)) continue; // déjà trouvée par le lexical
    have.add(line);
    lines.push(line);
  }
  return lines.join("\n");
}

/** `memory_search` — the model-pulled path (agent turns). The QUERY arrives already
 *  un-redacted by the loop (rule 11: the fake became the real value), so plain matching
 *  works. Compact French result, bounded; the loop re-redacted it before the model. */
export function searchMemoryStore(memory: MemoryData | undefined, query: string, max = 4): string {
  if (!memory) return "";
  const q = normalizeMem(query);
  if (!q) return "";
  // Stopwords out of the query: « les plans pour le weekend » must not hit every card
  // whose facts contain « les » — a match must carry at least one CONTENT word.
  const words = q.split(" ").filter((w) => w.length >= 3 && !isStopword(w));
  const hits = memory.cards
    .map((card) => {
      const hay = normalizeMem(`${card.entity} ${(card.aliases ?? []).join(" ")} ${card.facts}`);
      const score = words.filter((w) => hay.includes(w)).length;
      return { card, score };
    })
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score || b.card.updatedAt - a.card.updatedAt)
    .slice(0, max);
  if (!hits.length) return "";
  return hits
    .map(
      ({ card }) =>
        `${card.entity} (${memoryCategory(card.cat).label.toLowerCase()}) : ${card.facts} (noté le ${fmtDay(card.updatedAt)})`,
    )
    .join("\n");
}
