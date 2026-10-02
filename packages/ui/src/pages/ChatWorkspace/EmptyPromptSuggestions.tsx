import { EditIcon, FileIcon, UsersIcon, MemoryIcon, XIcon } from "../../components/brand";
import { pickStarters, starterCopy, type Starter } from "./starters";
import { useFeatureAccess } from "../../state/billing/featureAccess";
import type { ReactNode } from "react";

import { useT } from "../../i18n";
/**
 * The empty-thread prompt starters — ONE row, all of it working on any install.
 *
 * No integration offers here (`starters.ts` says why): every card sends a prompt that
 * works with nothing connected, and shows the masking on the data it carries.
 *
 * The tiles are NEUTRAL (monochrome) on purpose — the highlight hues are the REDACTION's
 * colour language, and wearing them on ordinary category badges diluted that meaning.
 */

/** The glyph a starter wears, by id. */
const UNIVERSAL_ICON: Record<string, ReactNode> = {
  "follow-up": <EditIcon size={16} />,
  "contract-review": <FileIcon size={16} />,
  "hr-review": <UsersIcon size={16} />,
  memory: <MemoryIcon size={16} />,
};

function StarterCard({ starter, onPick }: { starter: Starter; onPick: (prompt: string) => void }) {
  const t = useT();
  const { cat, prompt } = starterCopy(starter, t);
  return (
    <button
      type="button"
      className="om-starter"
      // The WHOLE prompt is here: the card only shows one line of it (the height is
      // the welcome screen itself), the branded tooltip renders the rest on hover —
      // preceded by the category, which is no longer written on the card.
      title={t.conversation.starters.cardTip(cat, prompt)}
      aria-label={t.conversation.starters.cardAria(cat, prompt)}
      onClick={() => onPick(prompt)}
    >
      {/* ONE line, and the CATEGORY is not written there: stacked, the card was 78px and
          the welcome screen overflowed at the bottom. So the glyph alone carries it, and
          the word stays in the tooltip and the accessible name. */}
      <span className="om-starter-tile">{UNIVERSAL_ICON[starter.id]}</span>
      <span className="om-starter-prompt">{prompt}</span>
    </button>
  );
}

export function EmptyPromptSuggestions({
  onPick,
  onDismiss,
}: {
  onPick: (prompt: string) => void;
  /** « Ne plus proposer » — absent ⇒ the cards cannot be dismissed. */
  onDismiss?: () => void;
}) {
  const t = useT();
  const access = useFeatureAccess();
  const starters = pickStarters({ memoryOpen: access.memory });
  return (
    <div className="om-starters-wrap">
      <div className="om-starters">
        {starters.map((s) => (
          <StarterCard key={s.id} starter={s} onPick={onPick} />
        ))}
      </div>
      {onDismiss && (
        <button type="button" className="om-starters-off" onClick={onDismiss}>
          <XIcon size={13} /> {t.conversation.starters.dismiss}
        </button>
      )}
    </div>
  );
}
