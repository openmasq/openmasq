import { redactionCategory, type RedactionMatch } from "@openmasq/redact";
import { pushDebug } from "../state/debug";

/**
 * Le RÉSUMÉ diagnostic d'une passe de redaction — étage A du « plus d'infos sans
 * casser la promesse » : des COMPTES et des ÉNUMÉRATIONS, jamais une valeur, jamais
 * un faux. C'est le même vocabulaire que s'impose l'analytics (counts + category
 * keys), appliqué au journal de débogage.
 */

const MAX_LISTED = 6;

function formatCounts(total: number, counts: Map<string, number>, uncertain: number): string {
  if (!total) return "0 valeur";
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const listed = top
    .slice(0, MAX_LISTED)
    .map(([k, n]) => `${k}×${n}`)
    .join(", ");
  const more = top.length > MAX_LISTED ? `, +${top.length - MAX_LISTED} cat.` : "";
  const doubt = uncertain ? ` (${uncertain} à vérifier)` : "";
  return `${total} valeur${total > 1 ? "s" : ""} · ${listed}${more}${doubt}`;
}

/** « 12 valeurs · name×3, email×2, iban×1 (2 à vérifier) » — groupé par catégorie
 *  fine (`category ?? type`), plafonné pour rester une LIGNE de journal. */
export function summarizeMatches(matches: readonly RedactionMatch[]): string {
  const counts = new Map<string, number>();
  let uncertain = 0;
  for (const m of matches) {
    const key = redactionCategory(m.category ?? m.type);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (m.uncertain) uncertain += 1;
  }
  return formatCounts(matches.length, counts, uncertain);
}

/** Le même résumé, DÉRIVÉ des paires redacted↔original qu'une entrée `wire`/`tool` du
 *  journal porte déjà — pour le pass MESSAGE, dont le site d'émission ne stocke rien de
 *  plus (les comptes se recalculent à l'affichage et à l'export). Valeurs DISTINCTES,
 *  la sémantique de `protectedCount`. */
export function summarizePairs(pairs: readonly { label?: string }[]): string {
  const counts = new Map<string, number>();
  for (const p of pairs) {
    const key = p.label || "autre";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return formatCounts(pairs.length, counts, 0);
}

/** Quel moteur a redacted — l'étiquette que le journal affiche à côté de la passe. */
export function engineLabel(useRemote: boolean, useModel: boolean, useLocal: boolean): string {
  if (useRemote) return "remote";
  if (useModel) return "modèle";
  if (useLocal) return "local";
  return "règles";
}

/**
 * Trace UNE passe de redaction dans le journal : une entrée `tool` ok/échec avec la
 * durée mesurée et, au succès, le résumé (`tail()` — lu APRÈS la passe, pour que le
 * site d'appel puisse l'accumuler pendant qu'elle tourne). Absorbe les deux blocs
 * try/catch jumeaux que `toolResult.ts` portait (règle 9).
 */
export async function tracedRedact<T>(
  o: { name: string; convId?: string; args: string; tail?: () => string },
  run: () => Promise<T>,
): Promise<T> {
  const t0 = performance.now();
  const ms = () => `${Math.round(performance.now() - t0)} ms`;
  try {
    const out = await run();
    const tail = o.tail?.();
    pushDebug(
      { type: "tool", name: o.name, ok: true, args: o.args, result: tail ? `${ms()} · ${tail}` : ms() },
      o.convId,
    );
    return out;
  } catch (e) {
    pushDebug(
      {
        type: "tool",
        name: o.name,
        ok: false,
        args: o.args,
        result: ms(),
        error: e instanceof Error ? e.message : String(e),
      },
      o.convId,
    );
    throw e;
  }
}
