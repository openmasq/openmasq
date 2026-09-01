import { CheckIcon, EyeIcon, ShieldIcon } from "./brand";
import { privacyLevelMeta, type PrivacyLevel } from "../privacy/privacyLevel";
import { useT } from "../i18n";

/**
 * The level control — the page's ONE decision.
 *
 * «           {t.leaves.privacyLevels.custom}
 » is never offered as a button: it is a STATE the user lands in by opening
 * the rules below, so the control shows it as the current choice when it applies but
 * doesn't invite it. Picking a preset from there rewrites the categories, which is why the
 * custom card says so before they click.
 *
 * ⚠️ **The shield isn't decorative: it asserts a protection.** A level marked
 * `reduced` therefore carries NONE of it — it gets the eye instead, which says « ceci reste lisible » —
 * without which the icon would assert exactly the protection the level removes (rule 8:
 * a UI that oversells masking is a trust bug, not a style choice). That's
 * been the case for « Standard » since it lets the BETA categories through. This icon is
 * now the ONLY signal the card carries: the detail lives in the matrix unfolded
 * below the levels. The full reasoning is in `privacy/privacyLevel.ts`.
 */
export function PrivacyLevelPicker({
  level,
  onPick,
}: {
  level: PrivacyLevel;
  onPick: (level: Exclude<PrivacyLevel, "custom">) => void;
}) {
  const t = useT();
  return (
    <div className="privacy-levels" role="radiogroup" aria-label={t.composer.protectionLevel}>
      {privacyLevelMeta(t).map((m) => {
        const on = level === m.id;
        return (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={on}
            className={`privacy-level${on ? " on" : ""}`}
            onClick={() => onPick(m.id)}
          >
            <span className="privacy-level-head">
              {/* No shield on a reduced level — see the file's header. */}
              {m.reduced ? <EyeIcon size={15} /> : <ShieldIcon size={15} />}
              <span className="privacy-level-name">{m.label}</span>
              {on && (
                <span className="privacy-level-check">
                  <CheckIcon size={14} />
                </span>
              )}
            </span>
            <span className="privacy-level-desc">{m.desc}</span>
            {/* The trade-off, always stated (rule 8): what the level leaves
                readable, or what its protection may distort in the reply. */}
            <span className="privacy-level-tradeoff">{m.tradeoff}</span>
          </button>
        );
      })}
      {level === "custom" && (
        <div className="privacy-level on privacy-level-custom" role="radio" aria-checked>
          <span className="privacy-level-head">
            <ShieldIcon size={15} />
            <span className="privacy-level-name">{t.leaves.privacyLevels.custom}</span>
            <span className="privacy-level-check">
              <CheckIcon size={14} />
            </span>
          </span>
          <span className="privacy-level-desc">
            {t.leaves.privacyLevels.customNote}
          </span>
        </div>
      )}
    </div>
  );
}
