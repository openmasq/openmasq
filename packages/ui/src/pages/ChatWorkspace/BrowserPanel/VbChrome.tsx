import type { FormEvent, RefObject } from "react";
import {
  ChevLeftIcon,
  ChevRightIcon,
  LockIcon,
  RefreshIcon,
  XIcon,
} from "../../../components/brand";
import { SearchEngineMenu } from "./SearchEngineMenu";

import { useT } from "../../../i18n";
/**
 * The browser panel's CHROME — the single nav/URL bar (the web TABS live in the
 * right rail, not here) — split out of `BrowserPanel` (rule 1): pure
 * presentation, every action a prop.
 */

export interface VbTab {
  id: string;
  url: string;
  title?: string;
  loading?: boolean;
  canGoBack?: boolean;
  canGoForward?: boolean;
}

export function VbBar({
  active,
  input,
  inputRef,
  onInput,
  onGo,
  onBack,
  onForward,
  onReload,
  searchEngine,
  onSearchEngineChange,
  onClose,
}: {
  active: VbTab | undefined;
  input: string;
  inputRef: RefObject<HTMLInputElement>;
  onInput: (v: string) => void;
  onGo: () => void;
  /** Session-history nav — absent (older preload / non-desktop) hides the pair. */
  onBack?: () => void;
  onForward?: () => void;
  onReload: () => void;
  /** Search-engine picker (rides the bar since the tab strip is gone). */
  searchEngine?: string;
  onSearchEngineChange?: (id: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onGo();
    // Blur so the URL bar tracks the page again — otherwise, still focused, the
    // `onPage` guard keeps it pinned to what you typed even after the page
    // navigates on (a search → its result, a redirect).
    inputRef.current?.blur();
  };
  return (
    <div className="vb-bar">
      <div className="vb-nav">
        {onBack && onForward && (
          <>
            <button
              className="vb-btn"
              aria-label={t.conversation.browser.back}
              title={t.conversation.browser.back}
              disabled={!active?.canGoBack}
              onClick={onBack}
            >
              <ChevLeftIcon size={16} />
            </button>
            <button
              className="vb-btn"
              aria-label={t.conversation.browser.forward}
              title={t.conversation.browser.forward}
              disabled={!active?.canGoForward}
              onClick={onForward}
            >
              <ChevRightIcon size={16} />
            </button>
          </>
        )}
        <button
          className="vb-btn"
          aria-label={t.conversation.browser.reload}
          title={t.conversation.browser.reload}
          disabled={!active?.url}
          onClick={onReload}
        >
          <RefreshIcon size={15} />
        </button>
      </div>
      <form className="vb-url" onSubmit={submit}>
        <span className="vb-lock">
          <LockIcon size={12} />
        </span>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => onInput(e.target.value)}
          spellCheck={false}
          placeholder={t.conversation.browser.urlPlaceholder}
          aria-label={t.conversation.browser.urlAria}
        />
      </form>
      {onSearchEngineChange && <SearchEngineMenu value={searchEngine} onChange={onSearchEngineChange} />}
      <button className="vb-btn" aria-label={t.conversation.browser.closeBrowser} title={t.conversation.browser.close} onClick={onClose}>
        <XIcon size={15} />
      </button>
    </div>
  );
}
