import { overriddenConnectors } from "@openmasq/catalog";
import { findConnector } from "@openmasq/catalog/mcp";
import { McpTile } from "../../../components/media/McpTile";
import { MaskLevelPicker } from "../../../components/MaskLevelPicker";
import { withConnectorLevel } from "../../../privacy/connectorMasking";
import { levelOf, type PrivacyLevel } from "../../../privacy/privacyLevel";
import type { Settings } from "../../../types";

import { useT } from "../../../i18n";

/**
 * Every connector that does NOT follow the level above — side by side.
 *
 * The MCP pane is where a connector's level is SET, one connector at a time, behind the
 * modal that manages it. This is the other question, and the one the privacy screen owes an
 * answer to: *what is not following the rule I just read?* Without it the level on this page
 * reads as the whole truth while an override sits two screens away.
 *
 * ⚠️ It lists the EXCEPTIONS, never the catalogue. Fifty-seven rows of "Default" would bury
 * the two that matter, and the section's whole job is to make those two impossible to miss —
 * so it renders nothing at all when there are none, rather than an empty frame.
 */
export function ConnectorLevelsSection({
  draft,
  setDraft,
}: {
  draft: Settings;
  setDraft: (updater: (s: Settings) => Settings) => void;
}) {
  const t = useT();
  const overridden = overriddenConnectors({
    level: "standard", // unused here: only `connectors` is read
    connectors: draft.connectorMasking ?? {},
  });
  if (overridden.length === 0) return null;

  const globalLevel: PrivacyLevel = levelOf(draft.redactCategories);

  return (
    <section className="settings-section">
      <div className="cv-eyebrow">{t.privacyTab.perConnectorEyebrow}</div>
      <p className="settings-hint">{t.privacyTab.perConnectorNote(overridden.length)}</p>
      <div className="settings-card connector-levels">
        {overridden.map((id) => {
          const connector = findConnector(id);
          return (
            <div className="connector-level-row" key={id}>
              <McpTile id={id} name={connector?.name ?? id} tone={connector?.tone ?? "slate"} md />
              <span className="connector-level-name">{connector?.name ?? id}</span>
              <MaskLevelPicker
                value={draft.connectorMasking?.[id]?.level ?? null}
                globalLevel={globalLevel}
                onPick={(level) =>
                  setDraft((s) => ({
                    ...s,
                    connectorMasking: withConnectorLevel(s.connectorMasking, id, level),
                  }))
                }
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
