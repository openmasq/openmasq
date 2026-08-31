import type { WriteRisk } from "./writeRisk";

/**
 * THE action-confirmation policy — the ONLY place that decides WHEN a
 * confirmation appears and ON WHICH surface. Main (the non-spoofable window) and the
 * renderer (the inline card) evaluate the SAME list (rule 9): editing a rule here
 * changes behavior everywhere, without touching a call site.
 *
 * The model: per mode, an ordered list of rules; the FIRST whose conditions all
 * hold decides the surface. No rule matches ⇒ no confirmation.
 * Conditions read FACTS measured by the caller (the loop / main) — the policy
 * never re-derives anything.
 *
 * ⚠️ RULE 7 — what this file is, and is not. The policy describes a confirmation
 * UX, not the entire security boundary: gates that are NOT confirmations
 * (domain allow-list, exfil scan, SSRF, redaction) stay
 * unconditional and never go through here. Two invariants to preserve when
 * editing it:
 *   - The `exfil` / `attachments` / `send` floors ALWAYS open a card, in
 *     both modes — an exfiltration signal, a file leaving in clear, or a
 *     send are not debounced "once per conversation", and a `floor` rule
 *     is exemptable by NO allow-list (see `ConfirmationRule.floor`).
 *   - An unreadable condition (unknown op) MATCHES: the evaluator over-confirms, it
 *     never under-confirms.
 *
 * ⚠️ ACCEPTED RESIDUAL (product decision): in `standard` mode the system window
 * NEVER appears — an ordinary write goes out without confirmation as long as the
 * conversation hasn't touched the web, and a single card is then posted. Systematic
 * confirmation is the « Mode renforcé » opt-in (Settings), whose
 * deactivation is confirmed on the non-spoofable window so that a renderer XSS
 * can't downgrade the posture in place of the user.
 */

export type ConfirmationMode = "standard" | "renforce";

/**
 * The ORDER of modes — higher = more confirming. This is what makes an organization
 * policy COMPOSABLE: the org sets a FLOOR, the member can only tighten it.
 *
 * The asymmetry is the same as in the main file (`confirmationMode.ts`): raising is
 * free, lowering confirms. A floor only adds a lower bound.
 */
const MODE_RANK: Record<ConfirmationMode, number> = { standard: 0, renforce: 1 };

/** `null`/unknown ⇒ `null` (no floor), never an invented mode. */
export function parseConfirmationMode(value: unknown): ConfirmationMode | null {
  return value === "standard" || value === "renforce" ? value : null;
}

/**
 * The effective mode = the stricter of the org's floor and the member's choice.
 *
 * ⚠️ Why this is safe even if the floor comes from an unverified source (the renderer
 * pushes the org profile to main): composition takes the MAXIMUM, so a
 * forged floor can only make the app MORE confirming. A floor can never relax
 * anything — that's what allows accepting it without proof of authenticity.
 */
export function composeConfirmationMode(
  orgFloor: ConfirmationMode | null | undefined,
  user: ConfirmationMode,
): ConfirmationMode {
  if (!orgFloor) return user;
  return MODE_RANK[orgFloor] >= MODE_RANK[user] ? orgFloor : user;
}

/** Can the member still choose? False when the floor is already at maximum — the
 *  settings toggle then locks, with the reason, rather than lying. */
export function confirmationModeLocked(orgFloor: ConfirmationMode | null | undefined): boolean {
  return orgFloor === "renforce";
}

/** Where the confirmation plays out. `inline` = the card in the conversation (renderer, UX);
 *  `system-modal` = the non-spoofable main window (the boundary). */
export type ConfirmationSurface = "inline" | "system-modal";

/**
 * The facts a condition can read. Absent numerics ⇒ 0: main, which knows neither
 * conversation counters nor loop signals, evaluates with only its `risk` and
 * gets exactly the part of the policy that concerns it (the `system-modal` rules).
 */
export interface ConfirmationFacts {
  /** Verdict of `writeRisk` on THIS call (main judges it from its own view). */
  risk: WriteRisk;
  /** Internet searches already sent in THIS conversation (current turn included). */
  searchToolCalls?: number;
  /** Exfiltration signals raised by the loop's scan on THIS call's args. */
  exfilFlags?: number;
  /** Files THIS call would attach (they leave in clear). */
  attachments?: number;
  /** THIS call sends something to a third party (e-mail, message): 1, otherwise 0.
   *  A send can't be undone — no draft to delete, no cancellation. That's
   *  what earns it a FLOOR in `standard` mode, just like exfiltration and
   *  attachments: the mode lightens confirmations, it doesn't remove the ones that
   *  bear on the irreversible. (Log from 27/07/2026: "Don't send anything" and the e-mail
   *  went out with no card ever opening.) */
  sends?: number;
  /** Confirmations already shown in THIS conversation (for `maxPerConversation`). */
  confirmationsShown?: number;
}

type NumericFact = Exclude<keyof ConfirmationFacts, "risk">;

export interface ConfirmationCondition {
  fact: keyof ConfirmationFacts;
  op: "gt" | "gte" | "lt" | "lte" | "eq" | "neq";
  value: number | WriteRisk;
}

export interface ConfirmationRule {
  /** Stable identifier — tests and the caller refer to it, never to the index. */
  id: string;
  surface: ConfirmationSurface;
  /** All conditions must hold (AND). Empty = always. */
  when: ConfirmationCondition[];
  /** The rule no longer fires once `confirmationsShown` reaches this cap. */
  maxPerConversation?: number;
  /**
   * FLOOR: the confirmation this rule decides can be exempted by NO
   * user allow-list ("Autoriser" per conversation, "toujours pour cet outil",
   * session auto-approval). A floor bears on the irreversible — exfiltration,
   * attachment, send — and "vous avez déjà confirmé" is not consent there:
   * the SECOND send confirms too. A rule with no `floor` stays exemptable.
   */
  floor?: boolean;
}

/**
 * The policy itself — a declarative literal, readable like JSON.
 *
 * `standard` (default): never a system window. A SINGLE card per conversation,
 * and only once the conversation is exposed to web content (the
 * prompt-injection vector) — plus the THREE uncapped security floors:
 * exfiltration, attachments, and anything that GOES OUT (a send can't be cancelled).
 *
 * `renforce` (Settings opt-in): the historical behavior — system window for a
 * risky write (`writeRisk === "high"`), inline card for everything else.
 */
export const CONFIRMATION_POLICY: Record<ConfirmationMode, ConfirmationRule[]> = {
  standard: [
    { id: "exfil-floor", surface: "inline", floor: true, when: [{ fact: "exfilFlags", op: "gt", value: 0 }] },
    { id: "attachments-floor", surface: "inline", floor: true, when: [{ fact: "attachments", op: "gt", value: 0 }] },
    // Floor, so WITHOUT `maxPerConversation`: every send confirms, including the
    // second. A "vous avez déjà confirmé un envoi" is not consent.
    { id: "send-floor", surface: "inline", floor: true, when: [{ fact: "sends", op: "gt", value: 0 }] },
    {
      id: "post-search-once",
      surface: "inline",
      when: [{ fact: "searchToolCalls", op: "gt", value: 0 }],
      maxPerConversation: 1,
    },
  ],
  renforce: [
    { id: "exfil", surface: "inline", floor: true, when: [{ fact: "exfilFlags", op: "gt", value: 0 }] },
    { id: "attachments", surface: "inline", floor: true, when: [{ fact: "attachments", op: "gt", value: 0 }] },
    { id: "risky-system", surface: "system-modal", when: [{ fact: "risk", op: "eq", value: "high" }] },
    // Reinforced mode can't be LESS confirming than standard: without this floor,
    // an ordinary send would match `every-write` (exemptable) and an "Autoriser" would
    // let the second e-mail out with no card — which standard, itself, refuses. Placed AFTER
    // `risky-system`: a risky send keeps the system window (main gates it on its side).
    { id: "send-floor", surface: "inline", floor: true, when: [{ fact: "sends", op: "gt", value: 0 }] },
    { id: "every-write", surface: "inline", when: [] },
  ],
};

function factValue(facts: ConfirmationFacts, fact: keyof ConfirmationFacts): number | WriteRisk {
  if (fact === "risk") return facts.risk;
  return facts[fact as NumericFact] ?? 0;
}

function holds(c: ConfirmationCondition, facts: ConfirmationFacts): boolean {
  const v = factValue(facts, c.fact);
  switch (c.op) {
    case "eq":
      return v === c.value;
    case "neq":
      return v !== c.value;
    case "gt":
      return typeof v === "number" && typeof c.value === "number" && v > c.value;
    case "gte":
      return typeof v === "number" && typeof c.value === "number" && v >= c.value;
    case "lt":
      return typeof v === "number" && typeof c.value === "number" && v < c.value;
    case "lte":
      return typeof v === "number" && typeof c.value === "number" && v <= c.value;
    default:
      // Unknown op (a future mistyped edit forced through): the condition MATCHES,
      // so the rule fires — we over-confirm, never under-confirm (rule 7).
      return true;
  }
}

/**
 * Evaluates the policy for a write call: the first rule of the mode whose
 * conditions all hold (and whose per-conversation cap isn't reached), or
 * `null` = no confirmation required. An unknown mode evaluates `renforce` (fail closed:
 * the most confirming posture).
 */
export function confirmationSurface(
  mode: ConfirmationMode,
  facts: ConfirmationFacts,
): ConfirmationRule | null {
  const rules = CONFIRMATION_POLICY[mode] ?? CONFIRMATION_POLICY.renforce;
  for (const rule of rules) {
    if (
      rule.maxPerConversation !== undefined &&
      (facts.confirmationsShown ?? 0) >= rule.maxPerConversation
    )
      continue;
    if (rule.when.every((c) => holds(c, facts))) return rule;
  }
  return null;
}
