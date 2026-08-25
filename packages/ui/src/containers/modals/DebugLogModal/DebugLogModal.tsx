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

type Filter = "all" | "phase" | "wire" | "turn" | "tool" | "error";
const TABS: { id: Filter; label: string }[] = [
  { id: "all", label: "Tout" },
  { id: "phase", label: "Étapes" },
  { id: "wire", label: "Wire" },
  { id: "turn", label: "Échanges" },
  { id: "tool", label: "Outils" },
  { id: "error", label: "Erreurs" },
];

/**
 * In-app debug log — wire messages (exact redacted text sent to the model + the
 * redacted↔original mapping), MCP tool calls, and send errors, captured while
 * debug mode is on. Newest first; filterable by type AND free-text SEARCH, per-entry
 * + bulk copyable, clearable. **Hovering a redacted token reveals its ORIGINAL value
 * + type**, exactly like the chat bubbles (the shared `RedactionInlineReveal`, mounted
 * read-only over the log body — a developer view has no per-conversation reveal action).
 */
export function DebugLogModal({ onClose, convId }: { onClose: () => void; convId?: string | null }) {
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
        <div className="cv-eyebrow rrm-eyebrow">DÉVELOPPEUR</div>
        <h2 className="cv-display rrm-title">Journal de débogage</h2>
        {/* Le détail de ce que contient le journal était une phrase de quatre lignes qui
            RÉÉNUMÉRAIT les filtres juste en dessous (Wire, Échanges, Outils, Erreurs).
            Ce qu'elle disait et que rien d'autre ne dit : c'est le RÉEL, et c'est scopé à
            cette conversation. */}
        <p className="rrm-sub">
          Ce qui a réellement été envoyé et reçu pour <strong>cette conversation</strong> —{" "}
          {/* Le pluriel français part à DEUX : « 0 entrée », pas « 0 entrées ». */}
          {convEntries.length} entrée{convEntries.length > 1 ? "s" : ""}.
        </p>
        <div className="dbg-search">
          <SearchIcon size={14} />
          <input
            type="text"
            className="dbg-search-input"
            placeholder="Rechercher (valeur réelle ou redacted, outil, erreur…)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button className="dbg-search-clear" title="Effacer" onClick={() => setQuery("")}>
              <XIcon size={13} />
            </button>
          )}
        </div>
        <div className="dbg-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`dbg-tab ${filter === t.id ? "on" : ""}`}
              onClick={() => setFilter(t.id)}
            >
              {t.label}
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
            title="Copie le journal complet, mapping redacted → original inclus (valeurs réelles — pour vos yeux)"
            onClick={() => copy("full")}
          >
            {copied === "full" ? <CheckIcon size={13} /> : <CopyIcon size={13} />}
            {copied === "full" ? "Copié" : "Copier (réel)"}
          </button>
          <button
            className="dbg-action"
            title="Copie le journal SANS le mapping redacted → original (aucune valeur réelle) — sûr à partager"
            onClick={() => copy("nomap")}
          >
            {copied === "nomap" ? <CheckIcon size={13} /> : <CopyIcon size={13} />}
            {copied === "nomap" ? "Copié" : "Sans mapping"}
          </button>
          {/* Vider ne touche QUE cette conversation (`convId ?? undefined` → tout quand
              aucune n'est ciblée) : jamais l'activité d'un autre onglet. */}
          <button
            className="dbg-action"
            title="Vider le journal de cette conversation"
            onClick={() => clearDebugLog(convId ?? undefined)}
          >
            <XIcon size={13} /> Vider
          </button>
          <span className="dbg-actions-spacer" />
          {openAvis && (
            <button
              className="dbg-action primary"
              title="Ouvre « Votre avis » avec le journal SANS mapping joint — vous le voyez avant l'envoi"
              onClick={() => {
                openAvis(debugJournalDraft(toText([...shown].reverse(), { mapping: false })));
                onClose();
              }}
            >
              <SendIcon size={13} /> Envoyer aux devs
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
