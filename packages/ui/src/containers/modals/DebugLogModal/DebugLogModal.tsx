import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ModalShell } from "../ModalShell";
import { XIcon, CheckIcon, SearchIcon, CopyIcon, SendIcon } from "../../../components/brand";
import { RedactionInlineReveal } from "../../../components/message/RedactionInlineReveal";
import { subscribeDebugLog, getDebugLog, clearDebugLog, type DebugEntry } from "../../../state/debug";
import { isEntryVisibleIn } from "../../../state/debugScope";
import { VirtualMessageList } from "../../../components/VirtualMessageList";
import { useFeedbackOpen } from "../../providers/feedbackOpen";
import { debugLogDraft } from "../../../feedback/feedback";
import { matchesQuery, toText } from "./entryText";
import { Row } from "./parts";

import { useT } from "../../../i18n";
type Filter = "all" | "phase" | "wire" | "turn" | "tool" | "error";
/** The order of the filters; their words come from the catalogue (`modals.debug.tabs`). */
const TAB_IDS: readonly Filter[] = ["all", "phase", "wire", "turn", "tool", "error"];

/**
 * In-app debug log — wire messages (exact redacted text sent to the model + the
 * redacted↔original mapping), MCP tool calls, and send errors, captured while
 * debug mode is on. Newest first; filterable by type AND free-text SEARCH, per-entry
 * + bulk copyable, clearable. **Hovering a redacted token reveals its ORIGINAL value
 * + type**, exactly like the chat bubbles (the shared `RedactionInlineReveal`, mounted
 * read-only over the log body — a developer view has no per-conversation reveal action).
 */
export function DebugLogModal({ onClose, convId }: { onClose: () => void; convId?: string | null }) {
  const t = useT();
  const entries = useSyncExternalStore(subscribeDebugLog, getDebugLog);
  const { openFeedback } = useFeedbackOpen();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState<"" | "full" | "nomap">("");
  const bodyRef = useRef<HTMLDivElement>(null);

  // Scope to THIS conversation — the rule lives in `state/debugScope.ts`
  // (`isEntryVisibleIn`, tested there): its entries + the app events, plus the
  // DRAFT when this panel opens on a chat not yet created — and an unattributed
  // entry carrying real values appears NOWHERE. Each entry was stamped
  // at emit time, so the split is exact even for interleaved turns.
  const convEntries = useMemo(
    () => entries.filter((e: DebugEntry) => isEntryVisibleIn(e, convId)),
    [entries, convId],
  );

  const shown = useMemo(
    () =>
      [...convEntries]
        .reverse()
        .filter((e: DebugEntry) => (filter === "all" || e.type === filter) && matchesQuery(e, query)),
    [convEntries, filter, query],
  );

  // Two exports: the full one (mapping redacted→ORIGINAL included — real values, for the
  // user's own eyes) and the « sans mapping » one, safe to PASTE elsewhere: it strips
  // every reversal pair, so what remains is the wire form that already left the machine.
  const copy = async (mode: "full" | "nomap") => {
    try {
      await navigator.clipboard.writeText(
        toText([...shown].reverse(), mode === "nomap" ? { mapping: false } : undefined),
      );
      setCopied(mode);
      setTimeout(() => setCopied(""), 1400);
    } catch {
      /* clipboard blocked — ignore */
    }
  };

  return (
    <ModalShell onClose={onClose} width="620px" maxHeight="86vh">
      <div className="rrm-head">
        <div className="cv-eyebrow rrm-eyebrow">{t.modals.debug.eyebrow}</div>
        <h2 className="cv-display rrm-title">{t.modals.debug.title}</h2>
        {/* The detail of what the log contains used to be a four-line sentence that
            RE-ENUMERATED the filters just below (Wire, Échanges, Outils, Erreurs).
            What it said that nothing else says: it's the REAL thing, and it's scoped to
            this conversation. */}
        <p className="rrm-sub">
          {t.modals.debug.subLead}
          <strong>{t.modals.debug.thisConversation}</strong>
          {t.modals.debug.subCount(convEntries.length)}
        </p>
        <div className="dbg-search">
          <SearchIcon size={14} />
          <input
            type="text"
            className="dbg-search-input"
            placeholder={t.modals.debug.searchPlaceholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button className="dbg-search-clear" title={t.modals.debug.clearSearch} onClick={() => setQuery("")}>
              <XIcon size={13} />
            </button>
          )}
        </div>
        <div className="dbg-tabs">
          {TAB_IDS.map((id) => (
            <button
              key={id}
              className={`dbg-tab ${filter === id ? "on" : ""}`}
              onClick={() => setFilter(id)}
            >
              {t.modals.debug.tabs[id]}
            </button>
          ))}
        </div>
        {/* ONE line for all the actions. The labels carry what the button
            CARRIES AWAY — « réel » vs « sans mapping » is a confidentiality difference,
            not a format one —, and the rest (what exactly it copies, what it sends)
            lives in the tooltip rather than on a second line. */}
        <div className="dbg-actions">
          <button
            className="dbg-action"
            title={t.modals.debug.copyFullTip}
            onClick={() => copy("full")}
          >
            {copied === "full" ? <CheckIcon size={13} /> : <CopyIcon size={13} />}
            {copied === "full" ? t.modals.debug.copied : t.modals.debug.copyFull}
          </button>
          <button
            className="dbg-action"
            title={t.modals.debug.copyNoMapTip}
            onClick={() => copy("nomap")}
          >
            {copied === "nomap" ? <CheckIcon size={13} /> : <CopyIcon size={13} />}
            {copied === "nomap" ? t.modals.debug.copied : t.modals.debug.copyNoMap}
          </button>
          {/* Clear touches ONLY this conversation (`convId ?? undefined` → everything when
              none is targeted): never another tab's activity. */}
          <button
            className="dbg-action"
            title={t.modals.debug.clearTip}
            onClick={() => clearDebugLog(convId ?? undefined)}
          >
            <XIcon size={13} /> {t.modals.debug.clear}
          </button>
          <span className="dbg-actions-spacer" />
          {openFeedback && (
            <button
              className="dbg-action primary"
              title={t.modals.debug.sendToDevsTip}
              onClick={() => {
                openFeedback(debugLogDraft(toText([...shown].reverse(), { mapping: false }), t));
                onClose();
              }}
            >
              <SendIcon size={13} /> {t.modals.debug.sendToDevs}
            </button>
          )}
        </div>
      </div>

      <div className="dbg-body-scroll" ref={bodyRef}>
        {shown.length === 0 ? (
          <div className="fv-status">
            {query.trim() || filter !== "all"
              ? "Aucune entrée ne correspond à ce filtre."
              : "Aucune entrée. Envoyez un message avec le mode débogage activé."}
          </div>
        ) : (
          // Virtualized: up to 200 entries, each a tall variable-height row (a wire
          // dump + its redacted↔original mapping, a tool's args/result…). Only the
          // rows near the viewport are mounted; `bodyRef` is the windowed scroller.
          // ≤30 entries render every row unchanged (the common case).
          <VirtualMessageList
            items={shown}
            scrollRef={bodyRef}
            getKey={(e) => e.id}
            threshold={30}
            estimate={90}
          >
            {(e) => <Row e={e} />}
          </VirtualMessageList>
        )}
      </div>

      {/* Hover-reveal — SAME strip as the chat bubbles. The marks show the WIRE fake,
          so the strip shows the REAL value it maps back to + its type. Read-only: the
          debug log is a global developer view, not a conversation (no un-redact). */}
      <RedactionInlineReveal
        containerRef={bodyRef}
        show="real"
        readOnly
        valueTitle="Valeur réelle (avant redaction)"
      />
    </ModalShell>
  );
}
