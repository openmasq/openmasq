import { Fragment } from "react";
import type { Messages } from "@openmasq/i18n";
import { MemoryIcon } from "../brand";
import { useMemoryUi, type MemoryUiApi } from "../../memory/memoryUi";
import type { Message } from "../../types";
import { useT } from "../../i18n";

/**
 * THE memory caption under a bubble — ONE line, whatever the feature has to say about
 * this message: the explicit « retiens que… » outcome (pending / noted / failed, with its
 * « Annuler »), the souvenirs that RODE the send, and the surprising non-recall. Three
 * captions used to stack under the same message; they now fold into one line with
 * « · » between parts, each part keeping its own deep-link.
 *
 * Consumes `useMemoryUi` HERE (not in MessageBubble) on purpose: a context change
 * re-renders this tiny leaf only, never the memo'd bubble around it. No provider mounted
 * ⇒ the resolvable parts render nothing / plain text (preview fragments).
 *
 * Silent by default: NORMAL non-recall (no mention at all) says nothing — the skipped
 * part only appears on the near-misses (injection budget saturated, a too-common
 * first name typed alone), otherwise its noise would train people to ignore it.
 */
interface Part {
  label: string;
  tip: string;
  onClick?: () => void;
}

/** « N faits notés » after an explicit « retiens que… » — the undo is DERIVED: once the
 *  created cards are gone (cancelled here or deleted on the page) the caption says so,
 *  instead of keeping a stale claim. Returns the part plus the ids « Annuler » forgets. */
function notedPart(t: Messages, mem: MemoryUiApi | null, message: Message): { part: Part; undo: string[] } | null {
  const c = t.conversation.memory;
  // Extraction in flight: say so right away — the seconds it takes read as a dead feature.
  if (message.memoryNotedPending && typeof message.memoryNoted !== "number")
    return { part: { label: c.pending, tip: c.pendingTip }, undo: [] };
  if (typeof message.memoryNoted !== "number") return null;
  // A REAL failure is told honestly — never dressed up as « rien de durable », an ANSWER.
  if (message.memoryNotedFailed) return { part: { label: c.failed, tip: c.failedTip }, undo: [] };
  const n = message.memoryNoted;
  const ids = message.memoryNotedIds ?? [];
  // A preference lands in the PROFILE (« Profil » sentinel), not a card: 0 facts, yet a save.
  const hasProfile = ids.includes("profile");
  const live = mem ? mem.resolve(ids).filter((i) => i.id !== "profile") : [];
  const updated = mem ? mem.resolve(message.memoryUpdatedIds ?? []).filter((i) => i.id !== "profile") : [];
  const undone = n > 0 && ids.some((id) => id !== "profile") && live.length === 0 && updated.length === 0;
  const updSuffix = updated.length ? c.updatedSuffix(updated.length) : "";
  const label =
    n === 0 ? (hasProfile ? c.preferenceSaved : c.nothingDurable) : undone ? c.undone : c.noted(n, hasProfile, updSuffix);
  const onClick =
    mem && (n > 0 || hasProfile) && !undone ? () => mem.open(live[0]?.id ?? updated[0]?.id) : undefined;
  return { part: { label, tip: c.notedTip, onClick }, undo: live.map((i) => i.id) };
}

export function MemoryCaption({ message }: { message: Message }) {
  const t = useT();
  const mem = useMemoryUi();
  const c = t.conversation.memory;
  const parts: Part[] = [];
  const noted = notedPart(t, mem, message);
  if (noted) parts.push(noted.part);
  // Which souvenirs rode this send (redacted). Ids resolve against the LIVE store.
  if (mem && message.memoryUsed?.length) {
    const items = mem.resolve(message.memoryUsed);
    const firstCard = items.find((i) => i.id !== "profile");
    if (items.length)
      parts.push({ label: c.used(items.map((i) => i.label).join(" · ")), tip: c.usedTip, onClick: () => mem.open(firstCard?.id) });
  }
  // The near-miss non-recall, made diagnosable — the message carries opaque ids.
  if (mem && message.memorySkipped?.length) {
    const byId = new Map(message.memorySkipped.map((s) => [s.id, s.reason]));
    const items = mem.resolve(message.memorySkipped.map((s) => s.id));
    const homographe = items.filter((i) => byId.get(i.id) === "homographe");
    const budget = items.filter((i) => byId.get(i.id) === "budget");
    const bits: string[] = [];
    if (homographe.length) bits.push(c.homographs(homographe.map((i) => i.label).join(", "), homographe.length));
    if (budget.length) bits.push(c.budget(budget.length));
    if (items.length) parts.push({ label: c.skipped(bits.join(" · ")), tip: c.skippedTip, onClick: () => mem.open(items[0]?.id) });
  }
  if (!parts.length) return null;
  const undo = noted?.undo ?? [];
  return (
    <div className="shield-caption memory-caption" title={parts[0].tip}>
      <MemoryIcon size={13} />
      <span className="flex-min">
        {parts.map((p, i) => (
          <Fragment key={i}>
            {i > 0 && <span className="caption-sep"> · </span>}
            {p.onClick ? (
              <button type="button" className="caption-link" onClick={p.onClick}>
                {p.label}
              </button>
            ) : (
              <span>{p.label}</span>
            )}
          </Fragment>
        ))}
      </span>
      {mem && undo.length > 0 && (
        <button type="button" className="caption-undo" title={c.undoTip} onClick={() => mem.forget(undo)}>
          {c.undo}
        </button>
      )}
    </div>
  );
}
