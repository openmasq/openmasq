import { SEARCH_ENGINES, DEFAULT_SEARCH_ENGINE } from "../../state/settings/searchEngines";
import { useT } from "../../i18n";
import { SearchEngineLogo } from "../../components/media/SearchEngineLogo";
import { CheckIcon } from "../../components/brand";
import { captureEvent } from "../../analytics";
import type { Settings } from "../../types";

/**
 * The "Navigateur" settings tab — ONE preference: the DEFAULT SEARCH ENGINE used when
 * you type keywords in the browser URL bar (DuckDuckGo / Brave / Google / Ecosia /
 * Startpage / Qwant), the same choice surfaced in the browser panel's engine dropdown.
 * The agent-browser SECURITY hardening (read-only + domain allow-list) is NOT here: it
 * sits with the write gate under « Ce que l'agent peut faire » on the Connecteurs tab
 * (`mcp/McpAgentPowers.tsx`) — the agent's guardrails read as one family, not two tabs.
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
  );
}
