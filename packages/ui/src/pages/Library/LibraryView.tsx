import { useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { useHost } from "../../host";
import { panelCloseItem, panelOpenFile, useAppDispatch } from "../../state/redux";
import type { Conversation } from "../../types";
import { ArrowRightIcon, BookIcon, CheckIcon, EmptyState, SearchIcon, TrashIcon } from "../../components/brand";
import { ConfirmDialog } from "../../components/feedback/ConfirmDialog";
import { PageHeader } from "../../containers/shell/PageHeader";
import { useSectionNav } from "../../containers/shell/useSectionNav";
import { LibraryTabs } from "./LibraryTabs";
import { FileCard } from "./FileCard";
import { FileRow } from "./FileRow";
import { ViewModeToggle } from "../../components/ViewModeToggle";
import { useViewMode } from "../../hooks/useViewMode";
import type { LibTab } from "./libraryKinds";
import { useLibraryFiles } from "./useLibraryFiles";
import type { LibFile } from "./libFile";
import type { ReattachSource } from "./reattach";

import { useT } from "../../i18n";
/* The file library — every file you've attached, stored locally in the DB `files`
   table (original + redacted bytes). Listed via host.db.listFiles, aggregated
   across conversations. Read-only view; never throws when the DB isn't configured.
   Reskinned to the design's category tabs + card GRID (see FileCard/LibraryTabs).

   The page shows ONE gisement: the files stored in the DB. The folders granted to the
   Filesystem connector are browsed from the right rail (`containers/shell/folders/`),
   beside the conversation — looking at a local file never copies it here. */

export function LibraryView({
  conversations,
  onOpenConversation,
  onReattach,
  onToggleSidebar,
}: {
  conversations: Conversation[];
  /** Open a conversation by its local id (from the file-detail panel). */
  onOpenConversation?: (id: string) => void;
  /** Re-attach a stored file into a new conversation (built + staged by the shell). */
  onReattach?: (src: ReattachSource) => void;
  /** Expand/collapse the primary sidebar (shell-owned). */
  onToggleSidebar?: () => void;
}) {
  const t = useT();
  const host = useHost();
  const [view, setView] = useViewMode("library");
  const dispatch = useAppDispatch();
  const { go } = useSectionNav();
  const { files, setFiles } = useLibraryFiles(conversations);
  // A clicked file opens in THE shared side panel (rendered by AppShell beside this
  // page) — the same panel the conversations use, kept across section switches.
  const openFile = (f: LibFile) =>
    dispatch(panelOpenFile({ id: f.id, name: f.name, mime: f.mime, convId: f.conversationId }));
  const [tab, setTab] = useState<LibTab>("all");
  // Drawn only when there IS something to browse (capability present AND at least one
  // granted folder) — an empty tab would advertise a feature the user hasn't set up.
  // Multi-select mode: a toolbar "Sélectionner" toggles it; cards then tick instead
  // of opening, and a bulk action bar acts on the selection (delete today).
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [query, setQuery] = useState("");
  const canDelete = !!host.db?.deleteFile;

  // Per-category counts (over ALL files) for the tab badges.
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: files?.length ?? 0 };
    for (const f of files ?? []) c[f.kind] = (c[f.kind] ?? 0) + 1;
    return c;
  }, [files]);

  // Cards matching the active tab AND the search box (name or owning-conversation title).
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (files ?? []).filter(
      (f) =>
        (tab === "all" || f.kind === tab) &&
        (!needle ||
          f.name.toLowerCase().includes(needle) ||
          f.conversationTitle.toLowerCase().includes(needle)),
    );
  }, [files, tab, query]);

  const exitSelect = () => {
    setSelectMode(false);
    setSelected(new Set());
  };
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const toggleAll = () =>
    setSelected((prev) =>
      prev.size >= visible.length && visible.length > 0
        ? new Set()
        : new Set(visible.map((f) => f.id)),
    );

  const deleteSelected = async () => {
    setConfirmBulk(false);
    const ids = selected;
    for (const id of ids) dispatch(panelCloseItem(id));
    setFiles((prev) => (prev ? prev.filter((x) => !ids.has(x.id)) : prev));
    exitSelect();
    await Promise.all([...ids].map((id) => host.db?.deleteFile?.(id)?.catch(() => {})));
  };

  const total = files?.length ?? 0;

  return (
    // Kit: the detail panel splits the WHOLE page (header included) — a row of
    // [page column | full-height panel], like LibraryPage's ResizableSplit.
    <main className="library-page">
      <PageHeader
        section="library"
        onToggleSidebar={onToggleSidebar}
      />

      <div className="library-body">
        {files === null ? (
          <div className="library-empty">{t.lists.loading}</div>
        ) : total === 0 ? (
          <div className="library-inner">
            <EmptyState
              tone="mint"
              eyebrow={t.sections.library.label}
              icon={<BookIcon size={26} />}
              title={t.lists.library.empty.title}
              body={t.lists.library.empty.body}
              points={[
                { glyph: "◱", label: t.lists.library.empty.points[0], tone: "pink" },
                { glyph: "▤", label: t.lists.library.empty.points[1], tone: "amber" },
                { glyph: "⛉", label: t.lists.library.empty.points[2], tone: "lime" },
              ]}
              // Files arrive THROUGH a conversation, so the way out of an empty
              // library is the chat — not an upload this page doesn't offer.
              cta={t.lists.library.goToChats}
              ctaIcon={<ArrowRightIcon size={16} />}
              onCta={() => go("chats")}
            />
          </div>
        ) : (
          <div className="library-inner">
            <LibraryTabs
              active={tab}
              onSelect={setTab}
              counts={counts}
              query={query}
              onQuery={setQuery}
            />
            {/* ONE toolbar row — the view toggle and « Sélectionner » side by side, the
                way `SkillFilters` lays its controls; two stacked rows for two buttons
                read as two features. */}
            <div className="library-toolbar">
              <ViewModeToggle mode={view} onChange={setView} />
              {canDelete &&
                (selectMode ? (
                  <div className="library-actions">
                    <span className="library-sel-count">{t.lists.library.selectedCount(selected.size)}</span>
                    <button className="btn-ghost btn-inline" onClick={toggleAll}>
                      {selected.size >= visible.length && visible.length > 0
                        ? t.lists.library.deselectAll
                        : t.lists.library.selectAll}
                    </button>
                    <button
                      className="btn-danger btn-inline"
                      disabled={selected.size === 0}
                      onClick={() => setConfirmBulk(true)}
                    >
                      <TrashIcon size={14} /> {t.lists.library.deleteCount(selected.size)}
                    </button>
                    <button className="btn-ghost btn-inline" onClick={exitSelect}>
                      {t.lists.library.done}
                    </button>
                  </div>
                ) : (
                  <button className="btn-ghost btn-inline" onClick={() => setSelectMode(true)}>
                    <CheckIcon size={14} /> {t.lists.library.select}
                  </button>
                ))}
            </div>
            {visible.length === 0 ? (
              <EmptyState
                tone="sky"
                eyebrow={query.trim() ? t.lists.library.noMatch.search : t.lists.library.noMatch.category}
                icon={<SearchIcon size={26} />}
                title={t.lists.library.noMatch.title}
                body={
                  t.lists.library.noMatch.body
                }
              />
            ) : (
              <div className={view === "list" ? "om-rows" : "library-grid"}>
                {visible.map((f) => {
                  const p = {
                    file: f,
                    selectMode,
                    selected: selected.has(f.id),
                    onOpen: () => openFile(f),
                    onToggle: () => toggle(f.id),
                    onDownload: host.db?.openFile ? () => void host.db?.openFile?.(f.id) : undefined,
                  };
                  return view === "list" ? <FileRow key={f.id} {...p} /> : <FileCard key={f.id} {...p} />;
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <AnimatePresence>
        {confirmBulk && (
          <ConfirmDialog
            title={t.lists.library.deleteTitle(selected.size)}
            message={t.lists.library.deleteBody(selected.size)}
            confirmLabel={t.common.delete}
            cancelLabel={t.common.cancel}
            onConfirm={deleteSelected}
            onCancel={() => setConfirmBulk(false)}
          />
        )}
      </AnimatePresence>
    </main>
  );
}
