import { EyeIcon, ShieldIcon } from "./brand";
import { privacyLevelMeta, type PrivacyLevel } from "../privacy/privacyLevel";
import type { ConnectorLevel } from "../privacy/connectorMasking";
import { useT } from "../i18n";

/**
 * A masking level for ONE connector — the compact form, meant to sit on a connector's row.
 *
 * The app reads the user's own files through one connector and a stranger's web page through
 * another; a single level is the wrong grain for that. This is the control that says so, and
 * `null` is its first option: not a fourth level but the ABSENCE of an override, which is
 * what nearly every connector wants and what the global setting already decides.
 *
 * ⚠️ It reads `privacyLevelMeta`, the same source the full-size picker reads, for the reason
 * that source exists: `reduced` is a FACT about what a level protects, so a reduced level
 * gets the EYE and never the shield. A compact control that quietly asserted protection the
 * level removes would be the trust bug rule 8 is about, at a smaller size.
 */
export function MaskLevelPicker({
  value,
  onPick,
  globalLevel,
  disabled,
}: {
  /** The connector's own level, or `null` when it follows the global one. */
  value: ConnectorLevel;
  onPick: (level: ConnectorLevel) => void;
  /** What "Default" resolves to right now — named, so the choice is not a guess. */
  globalLevel: PrivacyLevel;
  disabled?: boolean;
}) {
  const t = useT();
  const levels = privacyLevelMeta(t);
  const globalLabel =
    levels.find((m) => m.id === globalLevel)?.label ?? t.leaves.privacyLevels.custom;

  const option = (
    id: ConnectorLevel,
    label: string,
    title: string,
    icon: React.ReactNode,
  ) => {
    const on = value === id;
    return (
      <button
        key={id ?? "default"}
        type="button"
        role="radio"
        aria-checked={on}
        disabled={disabled}
        title={title}
        className={`om-seg-btn${on ? " on" : ""}`}
        onClick={() => onPick(id)}
      >
        {icon}
        <span>{label}</span>
      </button>
    );
  };

  return (
    <div
      className="om-seg om-seg--sm"
      role="radiogroup"
      aria-label={t.leaves.privacyLevels.perConnector.label}
    >
      {option(
        null,
        t.leaves.privacyLevels.perConnector.followsDefault,
        t.leaves.privacyLevels.perConnector.followsDefaultHint(globalLabel),
        <ShieldIcon size={12} />,
      )}
      {levels.map((m) =>
        option(
          m.id,
          m.label,
          m.short,
          m.reduced ? <EyeIcon size={12} /> : <ShieldIcon size={12} />,
        ),
      )}
    </div>
  );
}
