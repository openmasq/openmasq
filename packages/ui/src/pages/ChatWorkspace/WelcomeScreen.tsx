import type { ReactNode } from "react";
import { useT } from "../../i18n";
import { EmptyPromptSuggestions } from "./EmptyPromptSuggestions";

/**
 * The welcome for an EMPTY conversation — the greeting, the promise, the composer, the starters.
 *
 * No product brand up top: the rail and the sidebar already carry it on screen,
 * and a welcome that opens on ITS OWN logo talks about itself before talking to the user.
 *
 * Purely presentational: everything it triggers arrives as a prop, and the composer is
 * the SAME instance `ChatView` also renders at the bottom of a thread — not a second one.
 */
export function WelcomeScreen({
  greeting,
  composer,
  startersOff,
  onPick,
  onSeeAll,
  onSetStartersOff,
}: {
  greeting: string;
  composer: ReactNode;
  startersOff: boolean;
  /** Sends the starter — the SAME path as a typed message, never a shortcut that
   *  would bypass redaction. */
  onPick: (prompt: string) => void;
  /** "See others": the full list of connectors. */
  onSeeAll?: () => void;
  /** Absent ⇒ starters can neither be hidden nor come back (no setting to write). */
  onSetStartersOff?: (off: boolean) => void;
}) {
  const t = useT();
  return (
    <div className="welcome">
      <h1 className="cv-display">{greeting}</h1>
      {/* ⚠️ A privacy CLAIM (root rule 8), kept to ONE short line: name only what the
          DEFAULT categories actually catch. Names are honest here because the AI set
          defaults ON (catalog.test.ts pins it) with the offline NER as the default
          engine — if that default changes, this sentence changes with it. */}
      <p>{t.cards.welcome.subtitle}</p>
      {/* Composer right under the subtitle on home — in the action immediately. */}
      <div className="welcome-composer">{composer}</div>
      {startersOff ? (
        // The way out of the dead end: "stop suggesting" undoes with one click, at the same
        // spot. A link, not cards — the screen stays calm.
        onSetStartersOff && (
          <button type="button" className="om-starters-back" onClick={() => onSetStartersOff(false)}>
            {t.cards.welcome.seeExamples}
          </button>
        )
      ) : (
        <EmptyPromptSuggestions
          onPick={onPick}
          onSeeAll={onSeeAll}
          onDismiss={onSetStartersOff && (() => onSetStartersOff(true))}
        />
      )}
    </div>
  );
}
