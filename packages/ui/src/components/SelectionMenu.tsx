import { useEffect, useRef, useState } from "react";
import { hueForKind } from "@openmasq/redact";
import { captureEvent } from "../analytics";
import { ShieldIcon, LockIcon, MessageIcon, MemoryIcon } from "./brand";
import { REDACT_TYPES } from "@openmasq/redact";
import { BRAND } from "@openmasq/branding";

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
   *  click-a-word flow passes «Redact “mot”» so the target is unambiguous. */
  label?: string;
  /** Open DIRECTLY on the type grid (skip the stage-1 «Redact» button) — for a
   *  caller whose gesture already means "redact this" (a canvas word click). */
  expanded?: boolean;
  /** Small informational line under the title (e.g. «zone image, non envoyée»). */
  note?: string;
  /** D'où vient la sélection — le DOCUMENT (aperçu de PJ) l'annonce, sinon une
   *  sélection composer/message. Ne change que la télémétrie, jamais le geste. */
  origin?: "selection" | "document";
  /** Ferme le menu (Échap). La fermeture (clic extérieur, scroll, Échap) appartient
   *  au PROPRIÉTAIRE de l'état d'ouverture — le menu est ouvert ⇔ une sélection
   *  existe, c'est pourquoi il ne passe pas par `usePopover`, qui posséderait un
   *  second état. `useTextSelection`/`useTextareaSelection` gèrent déjà tout cela
   *  eux-mêmes ; ne passer `onClose` que pour un état ouvert AUTREMENT (le
   *  `wordPick` du viewer de PJ). */
  onClose?: () => void;
}) {
  const [showTypes, setShowTypes] = useState(!!expanded);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !onCloseRef.current) return;
      // CAPTURE + stopPropagation : dans l'aperçu de PJ, `ModalShell` écoute Échap
      // sur window (bulle) — sans l'arrêt, la même touche fermerait le menu ET la
      // modale sous lui.
      e.stopPropagation();
      onCloseRef.current();
    };
    document.addEventListener("keydown", h, true);
    return () => document.removeEventListener("keydown", h, true);
  }, []);
  const [scope, setScope] = useState<"conversation" | "coffre">("conversation");
  const pick = (token: string) => {
    // Un redaction MANUEL = le moteur a raté cette valeur : le vrai signal de faux
    // négatif, par CATÉGORIE seulement — le token est un id de type, jamais la valeur.
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
      aria-label="Actions sur la sélection"
      // Runtime-computed anchor (viewport coords) — the allowed inline-style exception.
      style={{ left: x, top: y }}
      onMouseDown={(e) => e.preventDefault()}
    >
      {showTypes ? (
        // Pas de second role="menu" : la racine le porte déjà (un menu imbriqué
        // dans un menu est invalide) — les items gardent role="menuitem".
        <div className="sel-redact-types">
          {onCoffre && (
            <div className="sel-redact-scope" role="radiogroup" aria-label="Portée du redaction">
              <button
                type="button"
                role="radio"
                aria-checked={scope === "conversation"}
                className={`sel-redact-scope-btn${scope === "conversation" ? " on" : ""}`}
                onClick={() => setScope("conversation")}
              >
                <ShieldIcon size={12} />
                Cette conversation
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={scope === "coffre"}
                className={`sel-redact-scope-btn${scope === "coffre" ? " on" : ""}`}
                onClick={() => setScope("coffre")}
              >
                <LockIcon size={12} />
                Coffre (toujours)
              </button>
            </div>
          )}
          <span className="sel-redact-eyebrow">{label ?? "Type de donnée"}</span>
          {note && <span className="sel-redact-note">{note}</span>}
          <div className="sel-redact-grid">
            {REDACT_TYPES.map((t) => (
              <button
                key={t.key}
                type="button"
                role="menuitem"
                className={`sel-redact-type hl-${hueForKind(t.token)}`}
                onClick={() => pick(t.token)}
              >
                {t.label}
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
            title="Redact la sélection"
            aria-label="Redact la sélection"
            onClick={() => setShowTypes(true)}
          >
            <ShieldIcon size={15} />
            <span className="sel-redact-label">Redact</span>
          </button>
          {onPreciser && (
            <button
              type="button"
              role="menuitem"
              className="sel-menu-btn sel-redact-preciser"
              title="Demander des précisions"
              aria-label="Demander des précisions"
              onClick={onPreciser}
            >
              <MessageIcon size={15} />
              <span className="sel-redact-label">Préciser</span>
            </button>
          )}
          {onRetenir && (
            <button
              type="button"
              role="menuitem"
              className="sel-menu-btn sel-retenir"
              /* Says WHAT it does, not how it is protected. The old wording led with
                 « redacted avant chaque envoi » — the Coffre's promise — so users read
                 this as a second Coffre. The Mémoire is the reuse feature: it carries
                 what you tell it into your NEXT conversations. */
              title={`Retenir dans la Mémoire — ${BRAND.name} s'en souviendra dans vos prochaines conversations`}
              aria-label="Retenir dans la Mémoire"
              onClick={onRetenir}
            >
              <MemoryIcon size={15} />
              <span className="sel-redact-label">Retenir</span>
            </button>
          )}
        </>
      )}
    </div>
  );
}
