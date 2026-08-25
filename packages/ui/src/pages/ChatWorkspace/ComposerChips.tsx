import { useState } from "react";
import { FileIcon, ShieldIcon } from "../../components/brand";
import type { Item } from "./composerDetection";
import type { longTextStats } from "./composerDetection";

/** Chips shown collapsed — enough for one comfortable row. Past it, the row folds
 *  behind « +N autres » : a dense letter's 40 detections must not push the send row
 *  below the fold (kept values always stay visible — an un-redaction is a decision
 *  the user must be able to SEE and revert, never hidden by the fold). */
export const CHIP_COLLAPSE_LIMIT = 8;

/**
 * The composer's small presentational leaves, peeled off `Composer.tsx` (LOC
 * ratchet): the per-value un-redact CHIPS row, and the LONG-DRAFT summary card
 * that replaces the inline textarea past `LONG_TEXT_THRESHOLD` (click → the
 * modal editor). Pure render — every decision stays with the caller.
 */

/** One chip per detected value: click toggles « garder en clair » for this send.
 *  The same gesture exists directly ON the highlighted word (`MarkKeepMenu`) —
 *  this row stays the overview + the way BACK (re-redact a kept value). */
export function DetectChips({
  items,
  keepSet,
  onToggle,
}: {
  items: Item[];
  keepSet: Set<string>;
  onToggle: (value: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  // Kept (un-redacted) values are NEVER folded away: that decision must stay
  // visible and revertable. The fold only hides still-redacted chips.
  const shown = expanded
    ? items
    : items.filter(
        (it, i) => i < CHIP_COLLAPSE_LIMIT || keepSet.has(it.value),
      );
  const hidden = items.length - shown.length;
  return (
    <div className="detect-chips">
      {shown.map(({ value, hue, uncertain }) => {
        const kept = keepSet.has(value);
        // « À vérifier » : détection à source unique et signal faible (voir
        // `Detection.uncertain`). La chip le MONTRE — la valeur reste redacted
        // tant que l'utilisateur ne la garde pas en clair (fail closed).
        const doubt = uncertain && !kept;
        return (
          <button
            key={value}
            type="button"
            className={`detect-chip hl-${hue} ${kept ? "kept" : ""}${doubt ? " doubt" : ""}`}
            title={
              kept
                ? "Redact à nouveau cet élément"
                : doubt
                  ? "Détection incertaine — redacted par défaut. Cliquez pour garder en clair."
                  : "Garder en clair (ne PAS redact) — envoyé tel quel au modèle"
            }
            onClick={() => onToggle(value)}
          >
            <ShieldIcon size={11} />
            <span className="detect-chip-val">{value}</span>
            {doubt && <span className="detect-chip-doubt">à vérifier</span>}
            <span className="detect-chip-x">{kept ? "↺" : "✕"}</span>
          </button>
        );
      })}
      {hidden > 0 && (
        <button
          type="button"
          className="detect-chip detect-more"
          title="Afficher toutes les détections"
          onClick={() => setExpanded(true)}
        >
          +{hidden} autres
        </button>
      )}
      {expanded && items.length > CHIP_COLLAPSE_LIMIT && (
        <button
          type="button"
          className="detect-chip detect-more"
          title="Replier la liste"
          onClick={() => setExpanded(false)}
        >
          Réduire
        </button>
      )}
    </div>
  );
}

/** The collapsed long-draft card (chars · lines · first line), click to edit. */
export function LongTextCard({
  stats,
  onOpen,
}: {
  stats: ReturnType<typeof longTextStats>;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      className="composer-longtext"
      onClick={onOpen}
      title="Ouvrir l'éditeur (texte long)"
    >
      <FileIcon size={16} />
      <span className="composer-longtext-body">
        <span className="composer-longtext-title">
          Texte long — {stats.chars.toLocaleString("fr-FR")} caractères ·{" "}
          {stats.lines.toLocaleString("fr-FR")} lignes
        </span>
        {stats.preview && <span className="composer-longtext-preview">{stats.preview}</span>}
      </span>
      <span className="composer-longtext-cta">Éditer</span>
    </button>
  );
}
