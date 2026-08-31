import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ModalShell } from "../ModalShell";
import { XIcon, CheckIcon, SearchIcon, CopyIcon, SendIcon } from "../../../components/brand";
import { RedactionInlineReveal } from "../../../components/message/RedactionInlineReveal";
import { subscribeDebugLog, getDebugLog, clearDebugLog, type DebugEntry } from "../../../state/debug";
import { isEntryVisibleIn } from "../../../state/debugScope";
import { VirtualMessageList } from "../../../components/VirtualMessageList";
import { useAvisOpen } from "../../providers/avisOpen";
import { debugJournalDraft } from "../../../avis/avis";
import { matchesQuery, toText } from "./entryText";
import { Row } from "./parts";

import { useT } from "../../../i18n";
type Filter = "all" | "phase" | "wire" | "turn" | "tool" | "error";
/** L'ordre des filtres ; leurs mots viennent du catalogue (`modals.debug.tabs`). */
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
  const { openAvis } = useAvisOpen();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState<"" | "full" | "nomap">("");
  const bodyRef = useRef<HTMLDivElement>(null);

  // Scope to THIS conversation — la règle vit dans `state/debugScope.ts`
  // (`isEntryVisibleIn`, testée là-bas) : ses entrées + les événements d'app, plus le
  // BROUILLON quand ce panneau s'ouvre sur un chat pas encore créé — et une entrée non
  // attribuée portant des valeurs réelles n'apparaît NULLE part. Each entry was stamped
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

  // Two exports: the full one (mapping redacted→ORIGINAL inclus — real values, for the
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
        {/* Le détail de ce que contient le journal était une phrase de quatre lignes qui
            RÉÉNUMÉRAIT les filtres juste en dessous (Wire, Échanges, Outils, Erreurs).
            Ce qu'elle disait et que rien d'autre ne dit : c'est le RÉEL, et c'est scopé à
            cette conversation. */}
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
        {/* UNE ligne pour toutes les actions. Les libellés portent ce que le bouton
            EMPORTE — « réel » vs « sans mapping » est une différence de confidentialité,
            pas de format —, et le reste (ce que ça copie exactement, ce que ça envoie)
            vit dans l'infobulle plutôt que sur une deuxième ligne. */}
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
          {/* Vider ne touche QUE cette conversation (`convId ?? undefined` → tout quand
              aucune n'est ciblée) : jamais l'activité d'un autre onglet. */}
          <button
            className="dbg-action"
            title={t.modals.debug.clearTip}
            onClick={() => clearDebugLog(convId ?? undefined)}
          >
            <XIcon size={13} /> {t.modals.debug.clear}
          </button>
          <span className="dbg-actions-spacer" />
          {openAvis && (
            <button
              className="dbg-action primary"
              title={t.modals.debug.sendToDevsTip}
              onClick={() => {
                openAvis(debugJournalDraft(toText([...shown].reverse(), { mapping: false }), t));
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
