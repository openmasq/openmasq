import { useEffect, type RefObject, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useMarkHover } from "./useMarkHover";
import { kindLabelFr } from "./kindLabel";
import { EyeIcon } from "../brand/icons/data";
import { LayersIcon, FeedbackIcon } from "../brand/icons/sections";
import { TrashIcon } from "../brand/icons/actions";
import { BottomSheet } from "../brand/BottomSheet";

const DEFAULT_MARK_SEL = ".redaction-mark[data-real]";

/**
 * The kit's redaction POPOVER (`RedactionPill` menu): hovering a redacted mark opens
 * a small tone-bordered card — a tinted header naming the data type + the COUNTERPART
 * value, then one action per scope: « Unredact » (this mark) and « Unredact la
 * catégorie » (every mark of that kind in this container). The rows never repeat the
 * type or the value: the header two lines above already carries both, and the tooltips
 * hold the precision. It flips BELOW the mark near
 * the viewport top, and carries the kit's pointer arrow.
 *
 * REUSED by three surfaces so they behave identically: (1) chat bubbles, where the
 * mark shows the REAL value and the header shows the FAKE the model saw (`show:"fake"`,
 * default); (2) the before-send DOCUMENT preview, where the mark shows the FAKE and
 * the header the REAL value that would leave if revealed (`show:"real"`,
 * `selector:"[data-doc-reveal]"`); (3) the read-only Debug Log (header only, no
 * actions). Only the value shown + the labels differ.
 *
 * Portal → never clipped by the scroll container. Driven by delegated mouseover/out
 * on the container root (works for React marks, Markdown marks AND the PDF/cell
 * overlay boxes) — no per-mark handlers. Stays open while the pointer is over the
 * mark OR the popover; closes on scroll (a fixed card would drift from its mark).
 *
 * MOBILE (`.app-mobile` ancestor — kit `MobilePill`): there is no hover, so the
 * menu is TAP-driven and presents as a `BottomSheet` (same content, `.rmark-sheet`
 * restyle) instead of the anchored popover. Same actions, same reveal semantics.
 */
export function RedactionInlineReveal({
  containerRef,
  onReveal,
  onReRedact,
  isRevealForced,
  revealed,
  selector = DEFAULT_MARK_SEL,
  show = "fake",
  readOnly = false,
  valueTitle = "Valeur vue par le modèle",
  revealTitle = "Unredact pour cette conversation",
  reRedactTitle = "Réactiver le redaction de cette valeur",
  onReport,
  onDelete,
  displayTokens,
  suppressed = false,
}: {
  containerRef: RefObject<HTMLElement | null>;
  onReveal?: (value: string, mode: "suspend" | "delete") => boolean | void;
  onReRedact?: (value: string) => void;
  isRevealForced?: (value: string) => boolean;
  revealed?: Set<string>;
  /** Which marks to watch. Default = chat marks; `[data-doc-reveal]` for documents. */
  selector?: string;
  /** Which value the header displays: the model-facing FAKE (chat) or the REAL value
   *  that would be sent in clear (document preview / debug log). */
  show?: "fake" | "real";
  /** Another floating surface owns the screen right now (a selection / word-pick menu):
   *  hide, and drop any card already open. Two cards over one document left the user with
   *  two sets of actions and no way to tell which applied to what. */
  suppressed?: boolean;
  /** No actions — a pure reveal (the developer Debug Log has no per-conversation
   *  reveal action, so it just shows the counterpart + its type). */
  readOnly?: boolean;
  /** Tooltip on the displayed value. */
  valueTitle?: string;
  /** Action tooltips for the two toggle directions. */
  revealTitle?: string;
  reRedactTitle?: string;
  /** « Signaler un redaction incorrect » — opens « Votre avis » prefilled (the caller
   *  binds the surface + opener). Receives the mark's KIND label only (a vocabulary
   *  word, never the value). Offered even in `readOnly` mode: reporting is not a
   *  reveal action. Absent ⇒ no report row. */
  onReport?: (kindLabel: string) => void;
  /** « Supprimer ce redaction » — DELETE the element entirely (a false positive):
   *  no mark, no tag, the value stays visible and leaves in clear. A reveal is a
   *  SUSPENSION instead: the mark renders as plain text too (unredacted = the
   *  redaction disappears, never a strikethrough) but stays hoverable to
   *  « Reredact », and the vault mapping survives for the way back. */
  onDelete?: (value: string) => void;
  /** Jetons display (`redactTokenDisplay`, ON by default): real value → `[PERSON1]`-style
   *  token. When present and `show:"fake"`, the header shows the TOKEN instead of the raw
   *  pseudonym — same rendering as the redacted document views, so the hover card and the
   *  documents speak one vocabulary. The caller computes it (it owns the vault); absent ⇒
   *  the raw pseudonym, which is what the audit journal (Réglages → Journal) deliberately keeps. */
  displayTokens?: Map<string, string>;
}) {
  // All the hover/tap plumbing — which mark, which presentation, when it closes —
  // lives in `useMarkHover.ts` (logic in .ts); this file is the card itself.
  const { hov, below, sheetOpen, sheetMode, close, cancelHide, scheduleHide } =
    useMarkHover(containerRef, selector);
  // Drop the open card when another surface takes over — not merely hide it, or it would
  // pop back the moment that surface closes.
  useEffect(() => {
    if (suppressed) close();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `close` is re-created per render
  }, [suppressed]);

  if (suppressed || !hov) return null;
  const forced = !!isRevealForced?.(hov.real);
  const isRevealed = !!revealed?.has(hov.real);

  const toggleOne = () => {
    if (forced) return;
    if (isRevealed) onReRedact?.(hov.real);
    else onReveal?.(hov.real, "suspend");
    close();
  };
  // « tous les … » — every mark of the SAME kind in this container (the reveal
  // itself is by VALUE and conversation-wide, so sibling bubbles follow).
  const toggleKind = () => {
    if (forced) return;
    const root = containerRef.current;
    if (!root) return close();
    const reals = new Set<string>();
    root.querySelectorAll<HTMLElement>(selector).forEach((m) => {
      if ((m.dataset.kind ?? "") === hov.kind && m.dataset.real) reals.add(m.dataset.real);
    });
    for (const real of reals) {
      if (isRevealForced?.(real)) continue;
      if (isRevealed) onReRedact?.(real);
      else onReveal?.(real, "suspend");
    }
    close();
  };

  // The FRENCH label, never the engine key: the card used to read « Unredact tous les
  // « company » » in an otherwise French interface (`kindLabel.ts`).
  const kindLabel = kindLabelFr(hov.kind);
  // The card + actions — ONE content tree, two presentations (popover / sheet).
  const content = (
    <>
      <span className="rmark-pop-value" title={valueTitle}>
        <span className="rmark-pop-eyebrow">
          {kindLabel} · {show === "real" ? "valeur réelle" : "vu par le modèle"}
        </span>
        <span className="rmark-pop-val">
          {(show === "real" ? hov.real : displayTokens?.get(hov.real) ?? hov.fake) || "—"}
        </span>
      </span>
      {readOnly ? null : forced ? (
        <span className="rmark-pop-btn locked" title="Imposé par l'organisation">
          🔒 Imposé par l'organisation
        </span>
      ) : (
        <>
          <button
            type="button"
            className="rmark-pop-btn"
            onClick={toggleOne}
            title={isRevealed ? reRedactTitle : revealTitle}
          >
            <EyeIcon size={14} /> {isRevealed ? "Reredact" : "Unredact"}
          </button>
          {hov.kind && (
            <button
              type="button"
              className="rmark-pop-btn"
              onClick={toggleKind}
              title={isRevealed ? reRedactTitle : revealTitle}
            >
              <LayersIcon size={14} />{" "}
              {isRevealed ? "Reredact la catégorie" : "Unredact la catégorie"}
            </button>
          )}
        </>
      )}
      {onDelete && !readOnly && !forced && (
        <button
          type="button"
          className="rmark-pop-btn danger"
          onClick={() => {
            onDelete(hov.real);
            close();
          }}
          title="Retirer entièrement ce redaction — la valeur restera visible et partira en clair"
        >
          <TrashIcon size={14} /> Supprimer le redaction
        </button>
      )}
      {onReport && (
        <button
          type="button"
          className="rmark-pop-btn"
          onClick={() => {
            onReport(hov.kind);
            close();
          }}
          title="Ouvre « Votre avis » prérempli — n'y collez jamais la valeur réelle"
        >
          <FeedbackIcon size={14} /> Signaler une erreur
        </button>
      )}
    </>
  );

  if (sheetMode.current) {
    return (
      <BottomSheet open={sheetOpen} onClose={close} maxH="auto" label="Redaction">
        <div className={`rmark-pop rmark-sheet hl-${hov.tone}`}>{content}</div>
      </BottomSheet>
    );
  }

  const cx = hov.rect.left + hov.rect.width / 2;
  const style: CSSProperties = {
    left: Math.max(120, Math.min(cx, window.innerWidth - 130)),
    top: below ? hov.rect.bottom + 8 : undefined,
    bottom: below ? undefined : window.innerHeight - hov.rect.top + 8,
  };
  return createPortal(
    <div
      className={`rmark-pop hl-${hov.tone}${below ? " below" : ""}`}
      style={style}
      onMouseEnter={cancelHide}
      onMouseLeave={scheduleHide}
    >
      {content}
      <span className="rmark-pop-arrow" aria-hidden="true" />
    </div>,
    document.body,
  );
}
