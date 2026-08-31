import { SEARCH_ENGINES, DEFAULT_SEARCH_ENGINE } from "../../state/searchEngines";
import { useT } from "../../i18n";
import { SearchEngineLogo } from "../../components/media/SearchEngineLogo";
import { CheckIcon } from "../../components/brand";
import { captureEvent } from "../../analytics";
import { McpBrowserSecurity } from "./mcp/McpBrowserSecurity";
import type { Settings } from "../../types";

/**
 * The "Navigateur" settings tab — every integrated-browser preference in one place:
 *  - the DEFAULT SEARCH ENGINE used when you type keywords in the browser URL bar
 *    (DuckDuckGo / Brave / Google / Ecosia / Startpage / Qwant), the same choice
 *    surfaced in the browser panel's engine dropdown;
 *  - the agent-browser SECURITY hardening (read-only mode + domain allow-list),
 *    reused verbatim from `McpBrowserSecurity`.
 * Desktop only (gated on `host.browser` by `SettingsView`).
 */
export function BrowserTab({
  draft,
  setDraft,
}: {
  draft: Settings;
  setDraft: (updater: (s: Settings) => Settings) => void;
}) {
  const t = useT();
  const current = draft.browserSearchEngine ?? DEFAULT_SEARCH_ENGINE;

  return (
    <>
      <section className="settings-section">
        <div className="cv-eyebrow">{t.browserTab.engineEyebrow}</div>
        <p className="modal-note">
          {t.browserTab.engineHint}
        </p>
        <div className="browser-engine-grid">
          {SEARCH_ENGINES.map((e) => {
            const on = e.id === current;
            return (
              <button
                key={e.id}
                className={`browser-engine-card${on ? " on" : ""}`}
                aria-pressed={on}
                onClick={() => {
                  captureEvent({ name: "setting_changed", key: "browserSearchEngine" });
                  setDraft((s) => ({ ...s, browserSearchEngine: e.id }));
                }}
              >
                <span className="browser-engine-logo">
                  <SearchEngineLogo id={e.id} size={22} />
                </span>
                <span className="browser-engine-name">{e.name}</span>
                {on && (
                  <span className="browser-engine-check">
                    <CheckIcon size={15} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      <McpBrowserSecurity settings={draft} setSettings={setDraft} />
    </>
  );
}
