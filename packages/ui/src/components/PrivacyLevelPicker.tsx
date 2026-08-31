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
 * ⚠️ **Le bouclier n'est pas décoratif : il affirme une protection.** Un niveau marqué
 * `reduced` n'en porte donc AUCUN — il reçoit l'œil, qui dit « ceci reste lisible » —
 * sans quoi l'icône affirmerait exactement la protection que le niveau retire (règle 8 :
 * une UI qui sur-vend le masquage est un bug de confiance, pas un choix de style). C'est
 * le cas de « Standard » depuis qu'il laisse passer les catégories BETA. Cette icône est
 * désormais le SEUL signal porté par la carte : le détail vit dans la matrice dépliée
 * sous les niveaux. Le raisonnement complet est dans `privacy/privacyLevel.ts`.
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
              {/* Pas de bouclier sur un niveau réduit — voir l'en-tête du fichier. */}
              {m.reduced ? <EyeIcon size={15} /> : <ShieldIcon size={15} />}
              <span className="privacy-level-name">{m.label}</span>
              {on && (
                <span className="privacy-level-check">
                  <CheckIcon size={14} />
                </span>
              )}
            </span>
            <span className="privacy-level-desc">{m.desc}</span>
            {/* La contrepartie, toujours dite (règle 8) : ce que le niveau laisse
                lisible, ou ce que sa protection peut fausser dans la réponse. */}
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
