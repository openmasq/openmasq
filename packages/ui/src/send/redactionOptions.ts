import { RETIRED_CATEGORIES } from "@openmasq/catalog/redaction";
import type { PseudonymizeOptions } from "@openmasq/redact";
import { coffreToForced } from "./coffre";
import { connectedUrlHosts } from "./redactKeep";
import type { CoffreTerm } from "../types";

/**
 * Le CŒUR d'options moteur d'un envoi — construit UNE fois dans `sendMessage`, passé
 * par spread à CHAQUE appel moteur du tour (mémoire, couches document, message,
 * résultats d'outils, chemins local ET remote).
 *
 * Pourquoi un objet plutôt que des arguments : l'invariant « une même valeur est
 * traitée PAREIL sur toutes les passes du tour » (même keep, mêmes catégories, même
 * dispense de notoriété, même salt/mode) ne tenait que par la discipline de recopier
 * ~9 sites à la main — ajouter `peopleNotoriety` a demandé neuf edits, chacun une
 * occasion d'oublier un site et de faire porter à une conversation la même valeur
 * sous deux formes. Avec le contexte, une option transversale nouvelle = UNE ligne.
 *
 * Ce qui n'y entre PAS, à dessein (varie par DÉCISION, pas par oubli) :
 * `forced`/`secrets` (par passe), `reFakeExisting` (contexte auteur vs écho d'outil),
 * `numbers` (payé seulement sur le message), `vault`/`text`, les fns de détection.
 * ⚠️ Les résultats d'outils REMPLACENT `kinds` par le `turnKinds` du tour (les spans
 * fraîchement redacted compris) — un override explicite, jamais une copie du ctx.
 */
export interface SendEngineContext {
  disabledKinds: string[];
  keep: string[];
  /** Les domaines des intégrations CONNECTÉES (`redactKeep.ts` `connectedUrlHosts`) :
   *  les sous-parties d'un lien qui pointe vers l'une d'elles restent en clair — voir
   *  `RedactOptions.structuralUrlHosts`. Transversal comme `keep` : même traitement sur
   *  le message, les couches et les résultats d'outils. */
  structuralUrlHosts?: string[];
  unrevealableCategories?: string[];
  avoid?: string[];
  kinds: Record<string, string>;
  salt: number;
  mode: "fake" | "token";
  commercialNotoriety: boolean;
  peopleNotoriety: boolean;
}

// Garde de compilation : le contexte doit RESTER un sous-ensemble des options du
// moteur — un champ renommé côté `@openmasq/redact` casse ici, pas en silence.
const _ctxSpreadsIntoEngine = (c: SendEngineContext): PseudonymizeOptions => c;
void _ctxSpreadsIntoEngine;

/**
 * Assemble le contexte moteur d'un envoi. PUR — c'est ce qui le rend vérifiable, et le
 * seul champ DÉRIVÉ ici est `structuralUrlHosts` : il sort de la liste des connecteurs
 * RÉELLEMENT connectés, pas du `keep` final que `sendKeepList` a déjà filtré par le
 * Coffre — un terme du Coffre qui collide avec un nom de connecteur doit reprendre la
 * main sur ce NOM, jamais rendre illisibles les liens que ce service renvoie.
 */
export function buildSendEngineContext(
  p: Omit<SendEngineContext, "structuralUrlHosts"> & { connected: readonly string[] },
): SendEngineContext {
  const { connected, ...rest } = p;
  return { ...rest, structuralUrlHosts: connectedUrlHosts(connected) };
}

// The PURE assembly of a send's redaction options — the security-critical merge that
// decides what is redacted (rule 7). Pulled out of `store.ts` `sendMessage` verbatim so
// each piece is unit-testable in isolation. The `redactOn` gating stays at the call site.

type ForcedItem = { value: string; category: string };
type MsgLike = { content: string; redactedSpans?: { value: string; kind: string }[] };
type ConvLike = {
  messages: MsgLike[];
  revealedValues?: string[];
  forcedRedactions?: ForcedItem[];
};

/** Effective categories = global defaults ⊕ this conversation's sparse override ⊕ the
 *  org's MANDATED categories (forced ON — a member can't disable them) ⊕ the RETIRED
 *  categories, forced OFF LAST so nothing can re-enable one.
 *
 *  Retired outranks even the org: the category has no toggle on any surface, so an org
 *  policy row naming it (written against an older catalog) would mandate a redaction no
 *  member could see, understand or turn off. The backend validator rejects new ones. */
export function effectiveRedactCategories(
  settingsCats: Record<string, boolean> | undefined,
  convCats: Record<string, boolean> | undefined,
  orgForcedCategories: string[] | undefined,
): Record<string, boolean> {
  const orgForcedOn: Record<string, boolean> = {};
  for (const cat of orgForcedCategories ?? []) orgForcedOn[cat] = true;
  const retiredOff: Record<string, boolean> = {};
  for (const cat of RETIRED_CATEGORIES) retiredOff[cat] = false;
  return { ...(settingsCats ?? {}), ...(convCats ?? {}), ...orgForcedOn, ...retiredOff };
}

/** The categories turned OFF (left in clear / not redacted nor highlighted). */
export function disabledKindsOf(effectiveCategories: Record<string, boolean>): string[] {
  return Object.entries(effectiveCategories)
    .filter(([, on]) => !on)
    .map(([kind]) => kind);
}

/** value → kind learned across the conversation (from each message's `redactedSpans`), so
 *  a disabled category stops substituting even a value already in the vault (fake tokens
 *  carry no category of their own). */
export function convKindsFromSpans(
  conv: Pick<ConvLike, "messages"> & { redactionKinds?: Record<string, string> },
): Record<string, string> {
  // The conversation-level map FIRST: it holds the categories of values that belong to no
  // message — a person named only in the injected mémoire, a document-layer (OCR) value, a
  // manual « Redact ». Reading spans alone left those untyped, so every consumer fell
  // back to « sensitive » (généric info) on the next turn even after the pass that found
  // them had recorded their category. A message's own span still wins: it is the more
  // specific evidence, and it is what the user actually typed.
  const convKinds: Record<string, string> = { ...(conv.redactionKinds ?? {}) };
  for (const m of conv.messages) for (const sp of m.redactedSpans ?? []) convKinds[sp.value] = sp.kind;
  return convKinds;
}

/** The conversation-aware fake-collision `avoid` blob: the REAL words already present in
 *  prior messages, so a newly-minted fake never reuses one (the "france" collision).
 *  Bounded to 20k chars; returns `undefined` when there's nothing to avoid. */
export function avoidBlob(conv: Pick<ConvLike, "messages">): string[] | undefined {
  const blob = conv.messages
    .map((m) => m.content)
    .filter(Boolean)
    .join("\n")
    .slice(0, 20_000);
  return blob ? [blob] : undefined;
}

/**
 * The `keep` allow-list for a send. Two kinds of entry, and they do NOT have the same
 * authority:
 *
 *  - **The user's EXPLICIT reveals** (`conv.revealedValues`, the composer's deselected
 *    chips) — a deliberate act, so they still win over everything.
 *  - **The AUTOMATIC connector list** (`connectedKeep`) — connector ids, server names
 *    and bare TOOL names, i.e. strings a THIRD-PARTY MCP server chooses. The user never
 *    approved these as reveals; they exist only so a tool name isn't vaulted and doesn't
 *    corrupt routing.
 *
 * `keep` outranks `forced` at the engine, so an automatic entry silently defeated the
 * Coffre's "toujours redacted, chaque envoi" contract: put "Nightingale" in the Coffre,
 * connect a server exposing a `notes__Nightingale` tool, and the real name shipped in
 * clear to every model — while the Coffre page still showed it as protected. A connector
 * called "Orange" or "Total" did it non-adversarially.
 *
 * So an automatic entry that collides with a FORCED value is dropped: the Coffre wins.
 * The tool name still reaches the model as its fake, which routing tolerates (the arg
 * un-redaction restores it); a leaked client name is not recoverable.
 * Pinned by `coffre.test.ts` ("a Coffre term equal to a connected tool name").
 */
export function sendKeepList(
  connectedKeep: string[],
  conv: Pick<ConvLike, "revealedValues">,
  keepValues: string[] | undefined,
  forced: readonly ForcedItem[] = [],
): string[] {
  const forcedLower = new Set(forced.map((f) => f.value?.toLowerCase()).filter(Boolean));
  const autoKeep = forcedLower.size
    ? connectedKeep.filter((k) => !forcedLower.has(k.toLowerCase()))
    : connectedKeep;
  return [...autoKeep, ...(conv.revealedValues ?? []), ...(keepValues ?? [])];
}

/** The user-FORCED manual redactions: the global COFFRE ⊕ the conversation's persisted set
 *  ⊕ any passed for THIS send. Deduped by value; only values actually present in the
 *  outgoing `modelText` are kept. (`keep` still overrides these at the engine.) */
/** The forced set for TOOL RESULTS: the full Coffre ⊕ the conversation's persisted
 *  set, deduped but UNFILTERED — a tool result's text isn't known when the send
 *  starts, and the Coffre's contract is "toujours redacted, quelle que soit la
 *  source": a Coffre value the user never typed that surfaces in a Gmail/CRM
 *  result must still be masked (a value absent from a result is a no-op). */
export function toolForcedList(
  coffre: CoffreTerm[] | undefined,
  conv: Pick<ConvLike, "forcedRedactions">,
): ForcedItem[] {
  const seen = new Set<string>();
  const out: ForcedItem[] = [];
  for (const f of [...coffreToForced(coffre), ...(conv.forcedRedactions ?? [])]) {
    const key = f?.value?.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}

export function sendForcedList(
  coffre: CoffreTerm[] | undefined,
  conv: Pick<ConvLike, "forcedRedactions">,
  optsForced: ForcedItem[] | undefined,
  modelText: string,
): ForcedItem[] {
  // Case-INSENSITIVE presence + dedup (audit): a Coffre term added as "Nightingale" must
  // still be forced when the text has "nightingale" — the engine expands it to every casing.
  // An exact `modelText.includes(f.value)` here dropped it BEFORE the engine ever saw it,
  // shipping the user's explicit always-redact value in clear. Dedup lowercased so the same
  // value in two casings isn't listed twice (mirrors `coffreHasValue`).
  const lower = modelText.toLowerCase();
  const seen = new Set<string>();
  const out: ForcedItem[] = [];
  for (const f of [
    ...coffreToForced(coffre),
    ...(conv.forcedRedactions ?? []),
    ...(optsForced ?? []),
  ]) {
    const key = f?.value?.toLowerCase();
    if (!key || seen.has(key) || !lower.includes(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}

/**
 * Audit (#7): should the user's CUSTOM system prompt be run through the DETECTOR before it
 * egresses? `buildSystemContent` only vault-REPLAYS it, so NOVEL PII a user wrote in Réglages
 * (a name/address) would ship in CLEAR on the first turn. True only for a non-empty prompt
 * that DIFFERS from the shipped default — the default carries no PII, so it (the vast
 * majority) pays no extra detector pass. The store does the redact + fail-close.
 */
export function shouldRedactSystemPrompt(
  systemPrompt: string | undefined,
  defaultPrompt: string,
): boolean {
  return !!systemPrompt?.trim() && systemPrompt !== defaultPrompt;
}
