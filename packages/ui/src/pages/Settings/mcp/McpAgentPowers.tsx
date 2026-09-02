import { useHost } from "../../../host";
import { useT } from "../../../i18n";
import type { Settings } from "../../../types";
import { McpBrowserSecurity } from "./McpBrowserSecurity";
import { McpWriteConfirm } from "./McpWriteConfirm";

/**
 * « Ce que l'agent peut faire » — the ONE section of the Connecteurs tab that holds the
 * agent's guardrails: the write gate (`McpWriteConfirm`: renforcé mode + the session
 * auto-approve) and, where the platform has an agent browser, its hardening
 * (`McpBrowserSecurity`: read-only + domain allow-list). They used to sit on two tabs
 * (Connecteurs / Navigateur) although they answer the same question — « qu'est-ce que
 * l'agent a le droit de faire tout seul ? » — so the Navigateur tab now keeps only its
 * search engine, and the ⌘K rows of both settings land here (`settingsIndex.ts`).
 *
 * Visibility is UX: every real gate re-runs in main (`composeConfirmationMode`, the
 * browser tool allow-list) — root rule 7, unchanged by the move.
 */
export function McpAgentPowers({
  settings,
  setSettings,
}: {
  settings: Settings;
  setSettings: (updater: (s: Settings) => Settings) => void;
}) {
  const t = useT();
  const host = useHost();
  return (
    <section className="settings-section">
      <div className="cv-eyebrow">{t.mcpTab.agentPowersEyebrow}</div>
      <p className="modal-note">{t.mcpTab.agentPowersHint}</p>
      <McpWriteConfirm embedded />
      {host.browser && <McpBrowserSecurity embedded settings={settings} setSettings={setSettings} />}
    </section>
  );
}
