import { useEffect, useRef, useState } from "react";
import { SEARCH_ENGINES } from "../../../state/settings/searchEngines";
import { SearchEngineLogo } from "../../../components/media/SearchEngineLogo";
import { ChevDownIcon, CheckIcon } from "../../../components/brand";
import { blockAgentOverlay, unblockAgentOverlay } from "../../../hooks/modalGate";

import { useT } from "../../../i18n";
/**
 * The search-engine picker that sits at the right of the browser tab strip. Shows
 * the CURRENT engine's logo; clicking opens a dropdown to switch it. The choice is
 * `Settings.browserSearchEngine` — a free-text URL-bar query then searches on it
 * (see `BrowserPanel.resolveTarget`). Purely a UI shell over the injected value/
 * setter, so the browser panel stays a thin presentation layer.
 */
export function SearchEngineMenu({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (id: string) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // While the menu is open, HIDE the native agent-browser overlay. Its window is
  // `alwaysOnTop` with no DOM z-order, so the dropdown — which opens DOWN into the
  // browser viewport rect — would render BEHIND it. Same imperative gate the
  // split-gutter drag uses (`useBrowserBounds` re-reads it every frame → hides at once,
  // re-shows on close).
  useEffect(() => {
    if (!open) return;
    blockAgentOverlay();
    return () => unblockAgentOverlay();
  }, [open]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="vb-engine" ref={rootRef}>
      <button
        className="vb-engine-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        title={t.conversation.browser.searchEngine}
        onClick={() => setOpen((o) => !o)}
      >
        <SearchEngineLogo id={value} size={15} />
        <ChevDownIcon size={12} />
      </button>
      {open && (
        <div className="vb-engine-menu" role="menu">
          <div className="vb-engine-menu-head">{t.conversation.browser.searchEngine}</div>
          {SEARCH_ENGINES.map((e) => {
            const on = e.id === (value ?? SEARCH_ENGINES[0].id);
            return (
              <button
                key={e.id}
                role="menuitemradio"
                aria-checked={on}
                className={`vb-engine-item${on ? " on" : ""}`}
                onClick={() => {
                  onChange(e.id);
                  setOpen(false);
                }}
              >
                <SearchEngineLogo id={e.id} size={16} />
                <span className="vb-engine-item-name">{e.name}</span>
                {on && (
                  <span className="vb-engine-item-check">
                    <CheckIcon size={14} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
