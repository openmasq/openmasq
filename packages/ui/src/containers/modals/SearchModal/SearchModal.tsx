import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { findModel } from "@openmasq/llm";
import type { Conversation } from "../../../types";
import { findModelAny } from "../../../prompt/models";
import { ModalShell } from "../ModalShell";
import { useT } from "../../../i18n";
import { SearchIcon, PlusIcon, ModelLogo } from "../../../components/brand";
import { groupConversationsByDate } from "../../../hooks/conversationGroups";
import type { SettingsDestination } from "../../../pages/Settings/settingsIndex";
import type { SectionDestination } from "../../../help";
import type { LibFile } from "../../../pages/Library/libFile";
import { relTime } from "./rowMeta";
import { FileRows, SectionRows, SettingsRows } from "./rows";

/**
 * ⌘K command palette — the SECTIONS, the real conversations, the stored FILES and the
 * settings.
 *
 * Every non-conversation group is INJECTED (a query→results callback) rather than
 * imported: this tier must not reach up into `pages/` for DATA (see containers/CLAUDE.md),
 * and it keeps the palette renderable with no Settings / no DB at all. Only the row TYPES
 * are type-imported (erased).
 *
 * ⚠️ The keyboard order IS the display order — action → sections → conversations → files
 * → settings — and the index arithmetic below is the only thing that knows it. Reorder the
 * groups and you must reorder both.
 */
export function SearchModal({
  conversations,
  onPick,
  onNew,
  onClose,
  settingsResults,
  onOpenSettings,
  sectionResults,
  onGoSection,
  fileResults,
  onOpenFile,
}: {
  conversations: Conversation[];
  onPick: (id: string) => void;
  onNew: () => void;
  onClose: () => void;
  /** Sections (and the guide) matching the query. */
  sectionResults?: (query: string) => SectionDestination[];
  /** Navigate to a section, or open « Aide » for the `"guide"` pseudo-destination. */
  onGoSection?: (id: SectionDestination["id"]) => void;
  /** Settings tabs matching the current query — resolved by the shell, which owns
   *  which tabs this platform/account actually has. */
  settingsResults?: (query: string) => SettingsDestination[];
  /** Open a settings tab by id. Absent ⇒ no settings rows (browser preview). */
  onOpenSettings?: (id: string) => void;
  /** Stored files matching the current query — resolved by the shell (it owns the
   *  DB listing). Absent ⇒ no file rows (no host DB). */
  fileResults?: (query: string) => LibFile[];
  /** Open a stored file (in the shared side panel). Absent ⇒ no file rows. */
  onOpenFile?: (file: LibFile) => void;
}) {
  const t = useT();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);

  const filtered = conversations.filter((c) =>
    (c.title || "Nouvelle conversation").toLowerCase().includes(q.toLowerCase()),
  );
  const groups = useMemo(() => groupConversationsByDate(filtered), [filtered]);
  // Each injected group. An EMPTY query yields none of them (the palette stays
  // conversation-first), so the rows appear only once you actually type.
  const sections = useMemo(
    () => (onGoSection && sectionResults ? sectionResults(q) : []),
    [q, sectionResults, onGoSection],
  );
  const settings = useMemo(
    () => (onOpenSettings && settingsResults ? settingsResults(q) : []),
    [q, settingsResults, onOpenSettings],
  );
  const files = useMemo(
    () => (onOpenFile && fileResults ? fileResults(q) : []),
    [q, fileResults, onOpenFile],
  );

  const picks = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  // Where each group starts in the flat keyboard order (the action owns index 0).
  const atSections = 1;
  const atConvs = atSections + sections.length;
  const atFiles = atConvs + picks.length;
  const atSettings = atFiles + files.length;
  const rowCount = atSettings + settings.length;
  const activeIdx = Math.min(active, rowCount - 1);
  const activeRef = useRef<HTMLButtonElement>(null);

  // Keep the highlighted row visible while arrowing through a long list.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  const pick = (idx: number): void => {
    if (idx === 0) {
      onNew();
      onClose();
      return;
    }
    const s = sections[idx - atSections];
    if (s && onGoSection) {
      onGoSection(s.id);
      onClose();
      return;
    }
    const c = picks[idx - atConvs];
    if (c) {
      onPick(c.id);
      return;
    }
    const f = files[idx - atFiles];
    if (f && onOpenFile) {
      onOpenFile(f);
      onClose();
      return;
    }
    const d = settings[idx - atSettings];
    if (d && onOpenSettings) {
      onOpenSettings(d.id);
      onClose();
    }
  };

  // ↑/↓ move the highlight (wrapping), Enter opens it. Handled on the input so
  // the palette is fully keyboard-drivable without leaving the search field.
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (Math.min(i, rowCount - 1) + 1) % rowCount);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (Math.min(i, rowCount - 1) + rowCount - 1) % rowCount);
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(activeIdx);
    }
  };

  const nothing =
    picks.length === 0 && files.length === 0 && settings.length === 0 && sections.length === 0;

  return (
    <ModalShell onClose={onClose} width="600px" align="top">
      <div className="search-head">
        <SearchIcon size={19} />
        <input
          autoFocus
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0); // a new filter → highlight the top match
          }}
          onKeyDown={onKeyDown}
          placeholder={t.modals.search.placeholder}
          className="search-input"
        />
        <span className="search-kbd">ESC</span>
      </div>
      <div className="search-body">
        <button
          ref={activeIdx === 0 ? activeRef : undefined}
          onClick={() => pick(0)}
          onMouseMove={() => setActive(0)}
          aria-selected={activeIdx === 0}
          className={`search-row search-row-new${activeIdx === 0 ? " is-active" : ""}`}
        >
          <PlusIcon size={16} />
          <span className="search-row-title">{t.modals.search.newChat}</span>
        </button>

        <SectionRows
          items={sections}
          from={atSections}
          activeIdx={activeIdx}
          activeRef={activeRef}
          setActive={setActive}
          onGo={(id) => {
            onGoSection?.(id);
            onClose();
          }}
        />

        {nothing ? (
          <div className="search-empty">{t.modals.search.noResults}</div>
        ) : (
          groups.map((group) => (
            <div key={group.key}>
              <div className="cv-eyebrow">{group.label}</div>
              {group.items.map((c) => {
                const idx = atConvs + picks.indexOf(c);
                const model = findModelAny(c.modelId) ?? findModel(c.modelId);
                const isActive = idx === activeIdx;
                // This conversation is mid-generation (a reply is still streaming).
                const busy = c.messages.some((m) => m.pending);
                return (
                  <button
                    key={c.id}
                    ref={isActive ? activeRef : undefined}
                    onClick={() => onPick(c.id)}
                    onMouseMove={() => setActive(idx)}
                    aria-selected={isActive}
                    className={`search-row${isActive ? " is-active" : ""}`}
                  >
                    {model && <ModelLogo provider={model.provider} modelId={model.id} size={16} />}
                    <span className="search-row-title">{c.title || t.chrome.untitledConversation}</span>
                    {busy && <span className="search-row-spin" aria-label={t.modals.searchRows.generating} />}
                    <span className="search-time">{relTime(c.updatedAt)}</span>
                  </button>
                );
              })}
            </div>
          ))
        )}

        <FileRows
          items={files}
          from={atFiles}
          activeIdx={activeIdx}
          activeRef={activeRef}
          setActive={setActive}
          onOpen={(f) => {
            onOpenFile?.(f);
            onClose();
          }}
        />
        <SettingsRows
          items={settings}
          from={atSettings}
          activeIdx={activeIdx}
          activeRef={activeRef}
          setActive={setActive}
          onOpen={(id) => {
            onOpenSettings?.(id);
            onClose();
          }}
        />
      </div>
    </ModalShell>
  );
}
