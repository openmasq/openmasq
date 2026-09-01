import { DEFAULT_LOCALE, getMessages } from "@openmasq/i18n";
import { isStopword } from "@openmasq/redact";
import type { MemoryData } from "../types";
import { memoryCategoryLabel, normalizeMem } from "./memory";
import { fmtDay } from "./select";

/** The injected block is read by the MODEL, never displayed: it keeps the source
 *  language, like the rest of the system prompt. */
const SOURCE = getMessages(DEFAULT_LOCALE);

/**
 * `memory_search` — the model-PULLED path (agent turns), split from `select.ts`
 * (the injection-time cascade): pulling on demand and choosing what to inject are
 * two different questions over the same store. Both format a card line the same
 * way (entity, category label, facts, dated), both are re-redacted downstream.
 */

/** Floor of `memory_search`'s semantic recall — BELOW the clustering threshold
 *  (`cluster.ts` CLUSTER_MIN_SIM = 0.92, calibrated card↔card): a QUERY is shorter than
 *  a card and scores lower, and `memory_search`'s result is a context the model judges
 *  (re-redacted, bounded), not a decision — the error leans toward recall. Clear margin
 *  over the e5 baseline (~0.85 between unrelated texts). */
const SEARCH_MIN_SIM = 0.88;

/** `memory_search`, a SEMANTIC tier on top of the lexical one: the question that
 *  DESCRIBES a card without naming it (« mon client du secteur audio ») matched no word.
 *  The lexical tier keeps priority (exact beats close); the semantic one tops up to
 *  `max`, above the floor, via `host.memoryIndex.query` (embedding on the device).
 *  Without an index (platform, missing bundle, error): the lexical alone, as before. */
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
    return lexical; // the index is a bonus — its failure never breaks the search
  }
  const have = new Set(lines);
  for (const h of hits) {
    if (lines.length >= max || h.sim < SEARCH_MIN_SIM) break; // trié par cosinus décroissant
    const card = memory.cards.find((c) => c.id === h.id);
    if (!card) continue;
    const line = `${card.entity} (${memoryCategoryLabel(card.cat, SOURCE).toLowerCase()}) : ${card.facts} (noté le ${fmtDay(card.updatedAt)})`;
    if (have.has(line)) continue; // already found by the lexical tier
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
        `${card.entity} (${memoryCategoryLabel(card.cat, SOURCE).toLowerCase()}) : ${card.facts} (noté le ${fmtDay(card.updatedAt)})`,
    )
    .join("\n");
}
