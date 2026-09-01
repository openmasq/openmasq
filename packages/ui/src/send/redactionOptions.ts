import { RETIRED_CATEGORIES } from "@openmasq/catalog/redaction";
import type { PseudonymizeOptions } from "@openmasq/redact";
import { vaultTermsToForced } from "./vaultTerms";
import { connectedUrlHosts } from "./redactKeep";
import type { VaultTerm } from "../types";

/**
 * The engine options CORE for a send — built ONCE in `sendMessage`, passed
 * by spread into EVERY engine call of the turn (memory, document layers, message,
 * tool results, both local AND remote paths).
 *
 * Why an object rather than arguments: the invariant "the same value is
 * treated THE SAME across every pass of the turn" (same keep, same categories, same
 * notoriety dispensation, same salt/mode) only held by the discipline of copying
 * ~9 sites by hand — adding `peopleNotoriety` took nine edits, each an
 * occasion to miss a site and have a conversation carry the same value
 * in two forms. With the context, a new cross-cutting option = ONE line.
 *
 * What does NOT go in, on purpose (varies by DECISION, not by omission):
 * `forced`/`secrets` (per pass), `reFakeExisting` (author context vs. tool echo),
 * `numbers` (paid only on the message), `vault`/`text`, the detection fns.
 * ⚠️ Tool results REPLACE `kinds` with the turn's `turnKinds` (freshly-redacted
 * spans included) — an explicit override, never a copy of the ctx.
 */
export interface SendEngineContext {
  disabledKinds: string[];
  keep: string[];
  /** The CONNECTED integrations' domains (`redactKeep.ts` `connectedUrlHosts`):
   *  the sub-parts of a link pointing at one of them stay in clear — see
   *  `RedactOptions.structuralUrlHosts`. Cross-cutting like `keep`: the same treatment on
   *  the message, the layers and the tool results. */
  structuralUrlHosts?: string[];
  unrevealableCategories?: string[];
  avoid?: string[];
  kinds: Record<string, string>;
  salt: number;
  /** Per-conversation key (hex) for the value→fake mapping. See `Conversation.redactionKey`. */
  key?: string;
  mode: "fake" | "token";
  commercialNotoriety: boolean;
  peopleNotoriety: boolean;
}

// Compile-time guard: the context must STAY a subset of the engine's
// options — a field renamed on the `@openmasq/redact` side breaks here, not silently.
const _ctxSpreadsIntoEngine = (c: SendEngineContext): PseudonymizeOptions => c;
void _ctxSpreadsIntoEngine;

/**
 * Assembles a send's engine context. PURE — that's what makes it verifiable, and the
 * only field DERIVED here is `structuralUrlHosts`: it comes from the list of connectors
 * ACTUALLY connected, not from the final `keep` that `sendKeepList` has already filtered by
 * the Coffre — a Coffre term that collides with a connector's name must take back
 * control over that NAME, never make unreadable the links that service returns.
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
  // manual « Masquer ». Reading spans alone left those untyped, so every consumer fell
  // back to « sensitive » (generic info) on the next turn even after the pass that found
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
  vaultTerms: VaultTerm[] | undefined,
  conv: Pick<ConvLike, "forcedRedactions">,
): ForcedItem[] {
  const seen = new Set<string>();
  const out: ForcedItem[] = [];
  for (const f of [...vaultTermsToForced(vaultTerms), ...(conv.forcedRedactions ?? [])]) {
    const key = f?.value?.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}

export function sendForcedList(
  vaultTerms: VaultTerm[] | undefined,
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
    ...vaultTermsToForced(vaultTerms),
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
