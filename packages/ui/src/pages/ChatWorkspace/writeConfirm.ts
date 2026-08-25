// Write-confirmation helpers for the agentic MCP loop's tool gate. Keeps the logic
// (readable arg summary, the copy, the session allow-list) out of the card (.tsx =
// presentation).

import type { WriteConfirmReason } from "../../agent/mcpAgent";
import { confirmationSurface, writeRisk, type ConfirmationMode } from "@openmasq/catalog/mcp";

/**
 * The specific TOOLS the user chose to "always allow, this session" — keyed per
 * `(connector, tool)`, NOT per connector: allowing `webflow · data_sites_tool`
 * must NOT also wave through every other Webflow write tool. Module-level +
 * ephemeral on purpose: it survives conversation switches (ChatView can remount)
 * but resets on app reload — matching "pour cette session". The write-confirm hook
 * consults it before opening a dialog.
 */
export const sessionAllowedWriteTools = new Set<string>();

/**
 * Tools already authorised ONCE in a given CONVERSATION — keyed `(conversation,
 * connector, tool)`. A plain « Autoriser » records here, so the SAME tool in the SAME
 * conversation never re-asks: an agent turn routinely calls one write tool several
 * times, and re-confirming each call taught users to click without reading — worse
 * than asking once. Narrower than the session list (another conversation asks again);
 * same lifetime (module-level, dies with the app). Rule 7 note: this list gates the
 * CARD only — the renderer gate is UX, main's own write gate is unchanged.
 */
export const conversationAllowedWriteTools = new Set<string>();

/**
 * GLOBAL session auto-approve (Réglages → MCP toggle). When on, the inline write card is
 * skipped for EVERY tool this session. ⚠️ SECURITY (root rule 7): this renderer flag is NOT
 * the boundary and cannot be flipped into a real bypass by a renderer XSS — it is mirrored to
 * `true` ONLY after `host.mcp.setWriteAutoApprove(true)` made MAIN confirm the enable on its
 * un-spoofable window, and main independently re-checks its OWN session flag on every write
 * (`writeConfirmWindow.isWriteAutoApproved`). So a card skipped here still hits main's gate
 * unless main was armed by that same real click. Ephemeral: resets on reload (protected). */
let autoApproveAllWrites = false;
export function isWriteAutoApproveAll(): boolean {
  return autoApproveAllWrites;
}
export function setWriteAutoApproveAll(on: boolean): void {
  autoApproveAllWrites = on;
}

/**
 * RENDERER mirror of the confirmation MODE (`standard` | `renforce`). The source of truth
 * is MAIN (`host.mcp.get/setConfirmationMode` — persisted, downgrade window-confirmed);
 * this mirror only feeds the CARD decision and is refreshed from the host at shell mount
 * and after every Réglages toggle (always with the RETURNED state, never the request).
 * While the boot read is in flight it says `standard` — the safe drift: worst case the
 * renderer draws a card main would have windowed (a double prompt, never a bypass).
 */
let confirmationMode: ConfirmationMode = "standard";
export function getConfirmationModeMirror(): ConfirmationMode {
  return confirmationMode;
}
export function setConfirmationModeMirror(mode: ConfirmationMode): void {
  confirmationMode = mode;
}

export type WriteConfirmDecision =
  /** No confirmation required by the policy — resolve the loop's promise `true`. */
  | "auto"
  /** Draw the in-conversation card and await the click. */
  | "card"
  /** Main's un-spoofable window IS the confirmation — resolve `true`, main asks. */
  | "defer-to-main";

export interface WriteConfirmVerdict {
  decision: WriteConfirmDecision;
  /** The matched rule is a PLANCHER: no user allow-list may exempt this confirmation
   *  (see `ConfirmationRule.floor` — exfil, attachments, sends re-ask EVERY time). */
  floor: boolean;
}

/**
 * The card decision, straight from `CONFIRMATION_POLICY` (rule 9: main judges the SAME
 * list on its own facts — this copy is UX; a drift costs a double prompt or a missing
 * card, never a missing main gate in mode renforcé). Pure so `writeConfirm.test.ts` can
 * pin every branch; the ambient counters/mirror are read by the ChatView call site.
 *
 * `mainWriteGate` absent (browser preview) downgrades a `system-modal` verdict to the
 * CARD — there is no window to defer to, and silently skipping would confirm nothing.
 */
export function writeConfirmDecision(p: {
  mode: ConfirmationMode;
  tool: string;
  server: string;
  exfilFlags: number;
  attachments: number;
  searchToolCalls: number;
  /** CE call fait-il partir un e-mail / un message ? Voir le plancher `send-floor`. */
  sends?: boolean;
  confirmationsShown: number;
  mainWriteGate: boolean;
}): WriteConfirmVerdict {
  const rule = confirmationSurface(p.mode, {
    risk: writeRisk(p.tool, { serverId: p.server }),
    searchToolCalls: p.searchToolCalls,
    exfilFlags: p.exfilFlags,
    attachments: p.attachments,
    sends: p.sends ? 1 : 0,
    confirmationsShown: p.confirmationsShown,
  });
  if (!rule) return { decision: "auto", floor: false };
  const floor = rule.floor === true;
  if (rule.surface === "system-modal")
    return { decision: p.mainWriteGate ? "defer-to-main" : "card", floor };
  return { decision: "card", floor };
}

/**
 * Applies the user's allow-lists AFTER the policy — the ORDER is the security fix
 * (audit B): the allow-lists used to short-circuit BEFORE `writeConfirmDecision`, so a
 * single « Autoriser » on `send_email` waved through every later send in the
 * conversation, attachments included — while the policy declares those rules PLANCHERS
 * (« chaque envoi se confirme, y compris le deuxième »). An allow-list may exempt only a
 * NON-floor confirmation; a floor verdict keeps its card whatever the user clicked
 * before. Pure — pinned by `writeConfirm.test.ts` (the two-sends regression).
 */
export function applyWriteAllowLists(
  verdict: WriteConfirmVerdict,
  allowedByUser: boolean,
): WriteConfirmDecision {
  if (allowedByUser && !verdict.floor) return "auto";
  return verdict.decision;
}

/** Stable key for the session allow-list (connector + tool). `\0` separates them because
 *  it cannot occur in either half, so no `(server, tool)` pair can forge another's key and
 *  inherit its allow. Keep it ESCAPED — written as a raw byte it made git treat this whole
 *  file as binary, which silently hid every later change to the gate from review. */
export function writeToolKey(server: string, tool: string): string {
  return `${server}\0${tool}`;
}

/** Same discipline for the per-conversation list: `\0`-separated, so no id/name can
 *  forge another triple's key. */
export function convWriteToolKey(convId: string, server: string, tool: string): string {
  return `${convId}\0${server}\0${tool}`;
}

/**
 * Which pending inline gate — if any — the view may auto-release to its fail-closed
 * default. Shared by BOTH cards the agent loop parks on (the write confirmation, and the
 * pre-search reveal offer): one rule, one home (rule 9), because they had the same bug.
 *
 * A card is auto-released for exactly ONE reason: its turn ended (Stop, or a failure)
 * while the card was still up, leaving the loop's promise dangling. The view can only
 * observe that for the conversation it is SHOWING, so the release is legal only when the
 * card's own conversation is on screen AND has stopped streaming.
 *
 * ⚠️ The two ids are separate parameters on purpose: turns run concurrently per tab, so
 * "is streaming" is a fact about the VIEWED conversation and says nothing about the one a
 * card belongs to. Collapsing them is the bug this function exists to prevent — merely
 * opening another thread then answered a card the user was never shown, and the card
 * vanished. On the write gate that refused a call silently and the model, told the tool
 * was refused, answered from its own memory of the FAKE — which un-redacts into a
 * confident, fabricated answer about the real person. A card whose thread the user
 * navigated away from is still a live question: it must WAIT for them to come back.
 */
export function pendingGateToRelease(p: {
  /** Conversations currently holding a pending card. */
  pendingConvIds: string[];
  /** The conversation on screen (undefined = none open). */
  viewedConvId?: string;
  /** Whether THAT conversation still has a pending assistant turn. */
  viewedIsStreaming: boolean;
}): string | null {
  if (!p.viewedConvId || p.viewedIsStreaming) return null;
  return p.pendingConvIds.includes(p.viewedConvId) ? p.viewedConvId : null;
}

export interface WriteArgSummary {
  /** Short human lines (e.g. the `actions[].label`s) — never raw JSON. */
  lines: string[];
  /** The model's own `context` note, if it supplied one. */
  context?: string;
  /** Pretty-printed JSON for the collapsible "details" view. */
  json: string;
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

/**
 * Turn a mutating tool's raw args into something readable. Recognises the common
 * `{ actions: [{ label, <op>: {...} }] }` shape (Webflow etc.) → the labels; else
 * falls back to the top-level keys. The full JSON is kept for a details toggle.
 */
export function describeWriteArgs(args: Record<string, unknown>): WriteArgSummary {
  const lines: string[] = [];
  const actions = (args as { actions?: unknown }).actions;
  if (Array.isArray(actions)) {
    for (const a of actions) {
      if (!a || typeof a !== "object") continue;
      const label = (a as { label?: unknown }).label;
      if (typeof label === "string" && label.trim()) {
        lines.push(clip(label.trim(), 80));
        continue;
      }
      // No label → name it after the first operation key (e.g. `list_sites`).
      const op = Object.keys(a as object).find((k) => k !== "label");
      if (op) lines.push(op.replace(/[_-]/g, " "));
    }
  }
  if (lines.length === 0) {
    for (const [k, v] of Object.entries(args)) {
      if (k === "context" || k === "actions") continue;
      const val = typeof v === "string" ? `: ${clip(v, 60)}` : typeof v === "number" || typeof v === "boolean" ? `: ${v}` : "";
      lines.push(`${k.replace(/[_-]/g, " ")}${val}`);
      if (lines.length >= 6) break;
    }
  }

  const ctx = (args as { context?: unknown }).context;
  const context = typeof ctx === "string" && ctx.trim() ? clip(ctx.trim(), 220) : undefined;

  let json: string;
  try {
    json = JSON.stringify(args, null, 2);
  } catch {
    json = String(args);
  }

  return { lines: lines.slice(0, 8), context, json };
}

/** The hostname a navigation targets, for the card's title. `""` when the arg isn't a
 *  parseable URL — the card then falls back to the connector name. */
export function navHostOf(args: Record<string, unknown>): string {
  const url = (args as { url?: unknown }).url;
  if (typeof url !== "string") return "";
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

export interface WriteConfirmCopy {
  eyebrow: string;
  title: string;
  desc: string;
  /** The footer's data-provenance line — what the shown values ARE. */
  note: string;
  confirm: string;
}

/**
 * What the card SAYS, per {@link WriteConfirmReason}. It used to hardcode the `write`
 * wording for all four, which told a user confirming a web SEARCH that the model wanted
 * to "créer, modifier ou supprimer des données" — a navigation does none of that.
 *
 * ⚠️ The `note` is a claim about where the user's data goes, so it must track the
 * un-redaction policy, not flatter it. Root rule 11: EVERY connector un-redacts every arg,
 * the browser included — only the MODEL ever sees a fake. So the note is the same for all
 * of them, and a browse-specific "tout le reste part redacted" would be a false comfort:
 * the page receives the real values, which is exactly why this card is being shown.
 */
export function writeConfirmCopy(
  reason: WriteConfirmReason,
  server: string,
  host: string,
): WriteConfirmCopy {
  const note = "Les valeurs affichées sont vos vraies données — c'est exactement ce qui partira.";
  switch (reason) {
    case "nav-exfil":
      return {
        eyebrow: "Navigation web",
        title: host ? `Ouvrir ${host} ?` : "Autoriser cette navigation ?",
        desc: "L'adresse emporte des données de la conversation — vérifiez qu'elles sont attendues.",
        note,
        confirm: "Ouvrir",
      };
    case "attachments":
      return {
        eyebrow: "Confirmation requise",
        title: "Envoyer ces fichiers ?",
        desc: `Cet envoi via ${server} emporte vos fichiers réels, dans leur version non redacted.`,
        note,
        confirm: "Envoyer",
      };
    default:
      return {
        eyebrow: "Confirmation requise",
        title: "Autoriser cette action ?",
        desc: `L'assistant demande à ${server} d'exécuter l'action ci-dessous. Elle peut créer, modifier ou supprimer des données — vérifiez son contenu avant d'autoriser.`,
        note,
        confirm: "Autoriser",
      };
  }
}
