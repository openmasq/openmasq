import { useEffect, useRef, useState } from "react";
import { hueForKind } from "@openmasq/redact";
import { captureEvent } from "../analytics";
import { ShieldIcon, LockIcon, MessageIcon, MemoryIcon } from "./brand";
import { REDACT_TYPES } from "@openmasq/redact";
import { BRAND } from "@openmasq/branding";
import { useT } from "../i18n";
import { redactTypeLabel } from "../privacy/redactTypeLabel";

/**
 * THE floating menu shown above a text selection — the SAME component for a selection in
 * the COMPOSER and in a MESSAGE (one concept, one home). Stage 1 offers "Redact" (+
 * "Préciser" where the caller wants it); clicking Redact reveals the curated data-TYPE
 * picker, and picking a type force-redacted the selected span AS that type (`onPick`).
 *
 * When `onCoffre` is provided a SCOPE toggle sits above the type grid: the user chooses
 * whether the pick applies to THIS conversation (`onPick`) or is added to the global
 * COFFRE — always redacted, every conversation + model (`onCoffre`).
 * `onMouseDown preventDefault` keeps the selection (textarea or DOM range) alive while
 * clicking.
 *
 * ⚠️ Both call sites select text displayed in CLEAR — a composer draft, or a message
 * already de-redacted for the user — so the selection IS the real value and is forced
 * as-is. A DOCUMENT preview is the exception (it shows FAKES and must be mapped back
 * first); that is why it goes through `doc/docForce.ts` rather than this menu's raw text.
 */
/** Below this viewport y (px) the above-anchored menu would clip — flip it under. */
const FLIP_BELOW_Y = 96;

export function SelectionMenu({
  x,
  y,
  onPick,
  onCoffre,
  onPreciser,
  onRetenir,
  label,
  expanded,
  note,
  origin = "selection",
  onClose,
}: {
  x: number;
  y: number;
  onPick: (token: string) => void;
  /** When set, picking under the "Coffre" scope adds the value to the global coffre. */
  onCoffre?: (token: string) => void;
  /** When set, a second stage-1 action quotes the selection into the composer and tags
   *  the send "Préciser". A message selection offers it; a composer draft does not. */
  onPreciser?: () => void;
  /** When set, a stage-1 « Retenir » adds the selection to the MÉMOIRE as a note —
   *  local, deterministic, no model call. A message selection offers it. */
  onRetenir?: () => void;
  /** Title shown over the type grid instead of the generic eyebrow — the
   *  click-a-word flow passes «Masquer “mot”» so the target is unambiguous. */
  label?: string;
  /** Open DIRECTLY on the type grid (skip the stage-1 «Masquer» button) — for a
   *  caller whose gesture already means "redact this" (a canvas word click). */
  expanded?: boolean;
  /** Small informational line under the title (e.g. «zone image, non envoyée»). */
  note?: string;
  /** Where the selection comes from — the DOCUMENT (attachment preview) states it,
   *  otherwise a composer/message selection. Only changes telemetry, never the gesture. */
  origin?: "selection" | "document";
  /** Closes the menu (Escape). Closing (outside click, scroll, Escape) belongs
   *  to the OWNER of the open state — the menu is open ⇔ a selection
   *  exists, which is why it doesn't go through `usePopover`, which would own a
   *  second state. `useTextSelection`/`useTextareaSelection` already handle all of this
   *  themselves; only pass `onClose` for a state opened OTHERWISE (the
   *  `wordPick` of the attachment viewer). */
  onClose?: () => void;
}) {
  const t = useT();
  const [showTypes, setShowTypes] = useState(!!expanded);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !onCloseRef.current) return;
      // CAPTURE + stopPropagation: in the attachment preview, `ModalShell` listens for Escape
      // on window (bubble) — without the stop, the same key would close the menu AND the
      // modal beneath it.
      e.stopPropagation();
      onCloseRef.current();
    };
    document.addEventListener("keydown", h, true);
    return () => document.removeEventListener("keydown", h, true);
  }, []);
  const [scope, setScope] = useState<"conversation" | "coffre">("conversation");
  const pick = (token: string) => {
    // A MANUAL redaction = the engine missed this value: the real false-negative
    // signal, by CATEGORY only — the token is a type id, never the value.
    captureEvent({ name: "redaction_forced", kind: token, source: scope === "coffre" ? "coffre" : origin });
    return scope === "coffre" && onCoffre ? onCoffre(token) : onPick(token);
  };
  // The menu hangs ABOVE the selection. Near the top of the viewport there is no room:
  // it used to render off-screen (select the first line of a document and the actions
  // were unreachable), so it flips BELOW instead. The threshold covers the tallest
  // one-row form plus its gap; the expanded type grid opens downward on its own.
  const below = y < FLIP_BELOW_Y;
  return (
    <div
      className={`sel-menu sel-redact${showTypes ? " on" : ""}${below ? " below" : ""}`}
      data-sel-menu=""
      role="menu"
      aria-label={t.menus.selection.ariaLabel}
      // Runtime-computed anchor (viewport coords) — the allowed inline-style exception.
      style={{ left: x, top: y }}
      onMouseDown={(e) => e.preventDefault()}
    >
      {showTypes ? (
        // No second role="menu": the root already carries it (a menu nested
        // inside a menu is invalid) — the items keep role="menuitem".
        <div className="sel-redact-types">
          {onCoffre && (
            <div className="sel-redact-scope" role="radiogroup" aria-label={t.menus.selection.scopeAria}>
              <button
                type="button"
                role="radio"
                aria-checked={scope === "conversation"}
                className={`sel-redact-scope-btn${scope === "conversation" ? " on" : ""}`}
                onClick={() => setScope("conversation")}
              >
                <ShieldIcon size={12} />
                {t.menus.selection.scopeConversation}
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={scope === "coffre"}
                className={`sel-redact-scope-btn${scope === "coffre" ? " on" : ""}`}
                onClick={() => setScope("coffre")}
              >
                <LockIcon size={12} />
                {t.menus.selection.scopeVault}
              </button>
            </div>
          )}
          <span className="sel-redact-eyebrow">{label ?? t.menus.selection.typeEyebrow}</span>
          {note && <span className="sel-redact-note">{note}</span>}
          <div className="sel-redact-grid">
            {/* `type`, not `t`: `t` is the translation catalogue here. */}
            {REDACT_TYPES.map((type) => (
              <button
                key={type.key}
                type="button"
                role="menuitem"
                className={`sel-redact-type hl-${hueForKind(type.token)}`}
                onClick={() => pick(type.token)}
              >
                {redactTypeLabel(type, t)}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          <button
            type="button"
            role="menuitem"
            className="sel-menu-btn sel-redact-redact"
            title={t.menus.selection.redactTip}
            aria-label={t.menus.selection.redactTip}
            onClick={() => setShowTypes(true)}
          >
            <ShieldIcon size={15} />
            <span className="sel-redact-label">{t.menus.selection.redact}</span>
          </button>
          {onPreciser && (
            <button
              type="button"
              role="menuitem"
              className="sel-menu-btn sel-redact-preciser"
              title={t.menus.selection.clarifyTip}
              aria-label={t.menus.selection.clarifyTip}
              onClick={onPreciser}
            >
              <MessageIcon size={15} />
              <span className="sel-redact-label">{t.menus.selection.clarify}</span>
            </button>
          )}
          {onRetenir && (
            <button
              type="button"
              role="menuitem"
              className="sel-menu-btn sel-retenir"
              /* Says WHAT it does, not how it is protected. The old wording led with
                 « masqué avant chaque envoi » — the Coffre's promise — so users read
                 this as a second Coffre. The Mémoire is the reuse feature: it carries
                 what you tell it into your NEXT conversations. */
              title={t.menus.selection.rememberTip(BRAND.name)}
              aria-label={t.menus.selection.rememberAria}
              onClick={onRetenir}
            >
              <MemoryIcon size={15} />
              <span className="sel-redact-label">{t.menus.selection.remember}</span>
            </button>
          )}
        </>
      )}
    </div>
  );
}
