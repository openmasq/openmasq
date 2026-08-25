import { wireSegments } from "@openmasq/redact";
import { estimateCost } from "@openmasq/llm";
import { getDebugLog, type DebugEntry, type DebugPair } from "../../../state/debug";
import { isEntryVisibleIn } from "../../../state/debugScope";
import { formatUsd } from "../../../state/usage";
import { formatTokens } from "../../../state/usage";
import { summarizePairs } from "../../../send/redactSummary";
import { valueShapeFor } from "./valueShape";

export type WireEntry = Extract<DebugEntry, { type: "wire" }>;
export type PhaseEntry = Extract<DebugEntry, { type: "phase" }>;
export type ToolEntry = Extract<DebugEntry, { type: "tool" }>;
export type TurnEntry = Extract<DebugEntry, { type: "turn" }>;

export const time = (ts: number) =>
  new Date(ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });

/** redacted token (what left the machine) ↔ original, deduped — the mapping that
 *  makes a redaction entry debuggable at a glance. Derived from a wire entry's
 *  vault; a tool entry carries its pairs directly (`e.pairs`). */
export function pairsFrom(
  text: string,
  vault: Record<string, string>,
  kinds?: Record<string, string>,
): DebugPair[] {
  const seen = new Set<string>();
  const pairs: DebugPair[] = [];
  for (const s of wireSegments(text, vault, kinds)) {
    if (s.kind !== "redaction" || seen.has(s.value)) continue;
    seen.add(s.value);
    pairs.push({ token: s.value, original: vault[s.value] ?? "", label: s.label, tone: s.tone });
  }
  return pairs;
}

export function pairsOf(e: WireEntry): DebugPair[] {
  return pairsFrom(e.text, e.vault ?? {}, e.kinds);
}

/** Compact token + estimated-cost line for a wire entry, e.g.
 *  "1 234 entrée · 567 sortie · 0,01 $". Returns null until the model reports usage
 *  (patched in post-send) — some providers report none. Shared by the row UI + the
 *  copy/search text so the cost is visible AND searchable.
 *
 *  ⚠️ Sur un tour AGENTIQUE ce coût est le CUMUL de tous les échanges modèle du tour,
 *  pas celui de ce message-là — le message ne part qu'une fois, mais chaque tour renvoie
 *  tout l'historique. La mention « cumul de N tours » est ce qui empêche de le lire comme
 *  une contradiction avec les lignes `turn` (journal du 27/07/2026 : « 28 079 entrée »
 *  sous un message de 221 caractères, « 13 938 entrée » au tour 1 juste en dessous). */
export function wireTokenSummary(e: WireEntry): string | null {
  if (e.inputTokens == null) return null;
  const out = e.outputTokens ?? 0;
  const cost = estimateCost(e.model, e.inputTokens, out);
  const turns = (e.modelTurns ?? 0) > 1 ? ` · cumul de ${e.modelTurns} tours` : "";
  // La part d'entrée servie par le CACHE du provider. Sans elle, une boucle agentique qui
  // renvoie tout l'historique à chaque tour se lit comme une entrée qui enfle, sans dire si
  // le préfixe stable (système + schémas d'outils) est réutilisé ou refacturé plein tarif.
  // ⚠️ `cost` reste l'estimation PLEIN TARIF (une lecture de cache est facturée ≈0,1×) —
  // c'est donc un majorant, et c'est cette part-là qui dit de combien.
  const cached =
    e.cachedInputTokens ? ` (dont ${formatTokens(e.cachedInputTokens)} en cache)` : "";
  return `${formatTokens(e.inputTokens)} entrée${cached} · ${formatTokens(out)} sortie · ${formatUsd(cost)}${turns}`;
}

/** The redacted↔original pairs for a tool entry: explicit `pairs` if set, else
 *  derived from its args+result against the vault (what the model saw ↔ real). */
export function toolPairsOf(e: ToolEntry): DebugPair[] {
  if (e.pairs) return e.pairs;
  if (!e.vault) return [];
  return pairsFrom(`${e.args ?? ""}\n${e.result ?? ""}`, e.vault, e.kinds);
}

/** Everything a turn exchange put on the wire, concatenated — the base for its
 *  redacted↔original mapping AND its search text. */
function turnWireText(e: TurnEntry): string {
  return [
    ...e.request.map((m) => m.content),
    e.text ?? "",
    ...(e.toolCalls ?? []).map((c) => `${c.name} ${c.args}`),
  ].join("\n");
}

export function turnPairsOf(e: TurnEntry): DebugPair[] {
  return pairsFrom(turnWireText(e), e.vault ?? {}, e.kinds);
}

/** Compact meta line for a turn exchange: request size, offered tools, usage, cost. */
export function turnSummary(e: TurnEntry): string {
  const parts = [
    `${e.msgCount} message${e.msgCount > 1 ? "s" : ""}${e.requestFull ? " (requête complète)" : ` (+${e.request.length} ce tour)`}`,
    `${e.toolsOffered} outil${e.toolsOffered > 1 ? "s" : ""} offert${e.toolsOffered > 1 ? "s" : ""}${e.toolChoice === "required" ? " · tool_choice=required" : ""}`,
  ];
  if (e.inputTokens != null) {
    const out = e.outputTokens ?? 0;
    // Le tour-par-tour est LE bon endroit pour lire le cache : c'est ici qu'on voit la part
    // grimper du tour 1 (amorçage) au tour 2+ (réutilisation), ou ne pas grimper du tout.
    const cached = e.cachedInputTokens ? ` (dont ${formatTokens(e.cachedInputTokens)} en cache)` : "";
    parts.push(`${formatTokens(e.inputTokens)} entrée${cached} · ${formatTokens(out)} sortie · ${formatUsd(estimateCost(e.model, e.inputTokens, out))}`);
  }
  if (e.stopReason) parts.push(`stop=${e.stopReason}`);
  if (e.ms !== undefined) parts.push(`${e.ms} ms`);
  return parts.join(" · ");
}

/** Head badge text per entry type. Phase steps show their family (model/tool/…). */
export function tagLabel(e: DebugEntry): string {
  if (e.type === "wire") return "wire";
  if (e.type === "tool") return e.ok ? "tool" : "tool ✗";
  if (e.type === "turn") return e.ok ? `tour ${e.turn}` : `tour ${e.turn} ✗`;
  if (e.type === "phase") return e.ok === false ? `${e.scope} ✗` : e.scope;
  return "error";
}

const mapBlock = (pairs: DebugPair[]): string => {
  const map = pairs
    .map((p) => `  ${p.token} → ${p.original}${p.label ? `  (${p.label})` : ""}`)
    .join("\n");
  return map ? `\n\nMapping (redacted → original):\n${map}` : "";
};

/** L'export « sans mapping » remplace la paire supprimée par un GABARIT de forme
 *  (`valueShape.ts` : casse/chiffres/séparateurs/longueur, jamais un caractère de la
 *  valeur ; un secret n'exporte même pas sa structure) + le résumé par catégorie —
 *  le diagnostic que l'avis emporte sans casser la promesse. */
const shapeBlock = (pairs: DebugPair[]): string => {
  if (!pairs.length) return "";
  const rows = pairs
    .map((p) => `  ${p.token} → ${valueShapeFor(p.original, p.label)}${p.label ? `  (${p.label})` : ""}`)
    .join("\n");
  return `\n\nRedaction : ${summarizePairs(pairs)}\nFormes (redacted → gabarit, jamais la valeur):\n${rows}`;
};

/** Le bloc de queue d'une entrée : mapping réel en interne, gabarits dans l'export. */
const tailBlock = (pairs: DebugPair[], withMap: boolean): string =>
  withMap ? mapBlock(pairs) : shapeBlock(pairs);

/** Serialize ONE entry to plain text (per-entry copy, the copy-all join AND the
 *  search index — so a query matches the wire text, args/result, mapping + labels).
 *  `mapping:false` (the « sans mapping » export) omits every redacted→ORIGINAL pair —
 *  the wire text has already left the machine, the mapping never has — and shows the
 *  per-category summary + each value's SHAPE template instead (`shapeBlock`). It cannot
 *  guarantee a server-emitted error string holds no real value; it only strips what
 *  the journal itself knows to be the reversal map. */
export function entryToText(e: DebugEntry, opts?: { mapping?: boolean }): string {
  const withMap = opts?.mapping !== false;
  const head = `[${time(e.at)}] ${e.type.toUpperCase()}`;
  if (e.type === "wire") {
    const tokens = wireTokenSummary(e);
    return `${head} → ${e.model}${tokens ? `\n${tokens}` : ""}\n${e.text}${tailBlock(pairsOf(e), withMap)}`;
  }
  if (e.type === "tool") {
    // A FAILED entry may still carry a `result` (run_python folds stderr + the model-facing
    // error text there) — show BOTH, never hide diagnostic content behind the ok flag.
    const body = [e.ok ? undefined : e.error, e.result].filter(Boolean).join("\n");
    return `${head} ${e.name} ${e.ok ? "ok" : "FAIL"}\nargs ${e.args ?? ""}\n${body}${tailBlock(toolPairsOf(e), withMap)}`;
  }
  if (e.type === "turn") {
    const req = e.request
      .map((m) => `  [${m.role}]${m.truncatedFrom ? ` (tronqué, ${m.truncatedFrom} car.)` : ""} ${m.content}`)
      .join("\n");
    const calls = (e.toolCalls ?? []).map((c) => `  → ${c.name} ${c.args}`).join("\n");
    return (
      `${head} ${e.ok ? "" : "ÉCHEC "}tour ${e.turn} → ${e.model}\n${turnSummary(e)}` +
      `\nOutils offerts : ${(e.toolNames ?? []).join(", ") || "(aucun)"}` +
      `\nRequête${e.requestFull ? " (complète)" : " (ajouts de ce tour)"} :\n${req || "  (aucun ajout)"}` +
      (e.text?.trim() ? `\nRéponse :\n${e.text}` : "") +
      (calls ? `\nAppels d'outils :\n${calls}` : "") +
      (e.error ? `\nErreur :\n${e.error}` : "") +
      tailBlock(turnPairsOf(e), withMap)
    );
  }
  if (e.type === "phase") {
    const dur = e.ms !== undefined ? ` (${e.ms} ms)` : "";
    return `${head} [${e.scope}] ${e.label}${e.detail ? ` — ${e.detail}` : ""}${dur}`;
  }
  return `${head} ${e.scope}\n${e.message}`;
}

/** Serialize the visible entries to plain text for the clipboard. */
export function toText(entries: readonly DebugEntry[], opts?: { mapping?: boolean }): string {
  return entries.map((e) => entryToText(e, opts)).join("\n\n");
}

/**
 * What the journal currently holds for ONE conversation, as the « sans mapping »
 * export — the form that is safe to attach to an avis (wire text that already left
 * the machine, with every redacted→réel pair stripped).
 *
 * Scoped by THE rule, `state/debugScope.ts` `isEntryVisibleIn` — pas par une copie du
 * prédicat. Celle qui vivait ici disait « cette conversation OU sans `conv` », c'est-à-dire
 * la version d'avant le durcissement : un avis pouvait emporter des entrées non
 * attribuées, et n'emportait jamais celles du BROUILLON. Une règle de confidentialité
 * recopiée n'est corrigée qu'au premier exemplaire (règle 9).
 *
 * Il lit le tampon vif parce que le tampon EST la source — mais il exporte TOUT, là où le
 * bouton de la modale exporte ce que l'utilisateur regarde (son filtre + sa recherche).
 * Deux sélections, un seul sérialiseur ; l'avis n'a pas de filtre à honorer.
 *
 * Empty when debug mode is off — nothing is captured then, and an empty string is what
 * tells the modal it has no journal to offer.
 */
export function journalExportFor(convId?: string | null): string {
  const entries = getDebugLog().filter((e) => isEntryVisibleIn(e, convId));
  return toText(entries, { mapping: false });
}

/** Free-text search over an entry — matches its full serialized form (wire text,
 *  tool args/result, the redacted↔original mapping, labels, model name) so a query
 *  finds an entry by ANY value it touched, real OR fake. Empty query ⇒ everything. */
export function matchesQuery(e: DebugEntry, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return entryToText(e).toLowerCase().includes(needle);
}
