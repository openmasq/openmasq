import { redactionCategory, type RedactionMatch } from "@openmasq/redact";
import { pushDebug } from "../state/debug";

/**
 * The diagnostic SUMMARY of a redaction pass — tier A of « more info without
 * breaking the promise »: COUNTS and ENUMERATIONS only, never a value, never
 * a fake. Same vocabulary the analytics enforces on itself (counts + category
 * keys), applied to the debug log.
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

/** « 12 valeurs · name×3, email×2, iban×1 (2 à vérifier) » — grouped by fine
 *  category (`category ?? type`), capped to stay a single log LINE. */
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

/** The same summary, DERIVED from the redacted↔original pairs a `wire`/`tool` log
 *  entry already carries — for the MESSAGE pass, whose emission site stores nothing
 *  more (counts are recomputed at display and export time). DISTINCT values,
 *  the semantics of `protectedCount`. */
export function summarizePairs(pairs: readonly { label?: string }[]): string {
  const counts = new Map<string, number>();
  for (const p of pairs) {
    const key = p.label || "autre";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return formatCounts(pairs.length, counts, 0);
}

/** Which engine did the redaction — the label the log shows beside the pass. */
export function engineLabel(useRemote: boolean, useModel: boolean, useLocal: boolean): string {
  if (useRemote) return "remote";
  if (useModel) return "modèle";
  if (useLocal) return "local";
  return "règles";
}

/**
 * Traces ONE redaction pass into the log: a `tool` entry ok/failed with the
 * measured duration and, on success, the summary (`tail()` — read AFTER the pass, so
 * the call site can accumulate it while it runs). Absorbs the two twin
 * try/catch blocks `toolResult.ts` used to carry (rule 9).
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
