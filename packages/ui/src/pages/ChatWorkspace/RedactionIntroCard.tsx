import { ArrowRightIcon, ShieldIcon, XIcon } from "../../components/brand";
import { useT } from "../../i18n";

/**
 * « Comprendre mon masquage » — the small container under the first replies.
 * When it shows (and why « Fermer pour toujours » is final):
 * `privacy/redactionIntro.ts`. It opens the guide's redaction chapter — never a
 * second explanation: the chapter IS the explanation, this container is only a door.
 *
 * Deliberately smaller than the neighboring inserts (`TransparencyCard`…): it's a
 * recurring invitation until dismissed, not an announcement — a full card that
 * came back every conversation would take the place of a reply.
 *
 * ⚠️ The ENTIRE container is the opening button, the cross is a button INSIDE the
 * button: hence the `stopPropagation` — closing must not open what's being closed.
 */
export function RedactionIntroCard({
  onOpen,
  onDismiss,
}: {
  onOpen: () => void;
  onDismiss: () => void;
}) {
  const t = useT();
  return (
    <div className="redintro" role="group" aria-label={t.cards.redactionIntro.ariaLabel}>
      <button type="button" className="redintro-open" onClick={onOpen}>
        <span className="redintro-ic">
          <ShieldIcon size={14} />
        </span>
        <span className="redintro-copy">
          <span className="redintro-title">{t.cards.redactionIntro.title}</span>
          <span className="redintro-sub">{t.cards.redactionIntro.sub}</span>
        </span>
        <ArrowRightIcon size={13} />
      </button>
      <button
        type="button"
        className="redintro-close"
        title={t.cards.redactionIntro.closeTip}
        aria-label={t.cards.redactionIntro.close}
        onClick={(e) => {
          e.stopPropagation();
          onDismiss();
        }}
      >
        <XIcon size={12} />
        <span>{t.cards.redactionIntro.close}</span>
      </button>
    </div>
  );
}
