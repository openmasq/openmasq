import type { RefObject } from "react";
import { SettingsIcon, HelpIcon, FileIcon } from "../../../components/brand";
import type { SectionDestination } from "../../../help";
import type { SettingsDestination } from "../../../pages/Settings/settingsIndex";
import type { LibFile } from "../../../pages/Library/libFile";
import { FILE_ICON, SECTION_ROW_ICON } from "./rowMeta";

import { useT } from "../../../i18n";
/**
 * The palette's non-conversation result groups. Pure presentation: each takes its rows,
 * the running keyboard index and the highlight, and reports clicks upward — the ordering
 * and the index arithmetic stay in `SearchModal.tsx`, which is the only place that can
 * get them right.
 */

interface GroupProps<T> {
  items: T[];
  /** Keyboard index of the FIRST row of this group. */
  from: number;
  activeIdx: number;
  activeRef: RefObject<HTMLButtonElement>;
  setActive: (i: number) => void;
}

/** « Aller à » — the six sections and the guide. Placed first after the action: someone
 *  typing « coffre » wants the place, not a conversation that mentions it. */
export function SectionRows({
  items,
  from,
  activeIdx,
  activeRef,
  setActive,
  onGo,
}: GroupProps<SectionDestination> & { onGo: (id: SectionDestination["id"]) => void }) {
  const t = useT();
  if (!items.length) return null;
  return (
    <div>
      <div className="cv-eyebrow">{t.modals.searchRows.goTo}</div>
      {items.map((s, i) => {
        const idx = from + i;
        const isActive = idx === activeIdx;
        const Icon = s.id === "guide" ? HelpIcon : SECTION_ROW_ICON[s.id];
        return (
          <button
            key={s.id}
            ref={isActive ? activeRef : undefined}
            onClick={() => onGo(s.id)}
            onMouseMove={() => setActive(idx)}
            aria-selected={isActive}
            className={`search-row search-row-set${isActive ? " is-active" : ""}`}
          >
            <Icon size={16} />
            <span className="search-row-title">{s.title}</span>
            <span className="search-row-sub">{s.sub}</span>
          </button>
        );
      })}
    </div>
  );
}

export function FileRows({
  items,
  from,
  activeIdx,
  activeRef,
  setActive,
  onOpen,
}: GroupProps<LibFile> & { onOpen: (f: LibFile) => void }) {
  const t = useT();
  if (!items.length) return null;
  return (
    <div>
      <div className="cv-eyebrow">{t.modals.searchRows.files}</div>
      {items.map((f, i) => {
        const idx = from + i;
        const isActive = idx === activeIdx;
        const Icon = FILE_ICON[f.kind] ?? FileIcon;
        return (
          <button
            key={f.id}
            ref={isActive ? activeRef : undefined}
            onClick={() => onOpen(f)}
            onMouseMove={() => setActive(idx)}
            aria-selected={isActive}
            className={`search-row search-row-file${isActive ? " is-active" : ""}`}
          >
            <Icon size={16} />
            <span className="search-row-title">{f.name}</span>
            <span className="search-row-sub">{f.conversationTitle}</span>
          </button>
        );
      })}
    </div>
  );
}

export function SettingsRows({
  items,
  from,
  activeIdx,
  activeRef,
  setActive,
  onOpen,
}: GroupProps<SettingsDestination> & { onOpen: (id: string) => void }) {
  const t = useT();
  if (!items.length) return null;
  return (
    <div>
      <div className="cv-eyebrow">{t.modals.searchRows.settings}</div>
      {items.map((d, i) => {
        const idx = from + i;
        const isActive = idx === activeIdx;
        return (
          <button
            key={d.id}
            ref={isActive ? activeRef : undefined}
            onClick={() => onOpen(d.id)}
            onMouseMove={() => setActive(idx)}
            aria-selected={isActive}
            className={`search-row search-row-set${isActive ? " is-active" : ""}`}
          >
            <SettingsIcon size={16} />
            <span className="search-row-title">{d.title}</span>
            <span className="search-row-sub">{d.sub}</span>
          </button>
        );
      })}
    </div>
  );
}
