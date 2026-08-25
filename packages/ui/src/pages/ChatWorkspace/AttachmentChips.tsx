import type { CSSProperties } from "react";
import { FileIcon, RefreshIcon } from "../../components/brand";
import type { Attachment } from "./Composer";
import { ocrShortfall } from "./ocrShortfall";

/**
 * The composer's ATTACHMENT chip row (kit ComposerFileThumb) — peeled off
 * `Composer.tsx` (LOC ratchet). Pure render over the attachment lifecycle the
 * caller owns: extraction → redaction (with progress) → error / stale-engine
 * re-run / preview open / remove.
 */
export function AttachmentChips({
  attachments,
  currentRedactSig,
  onRetry,
  onOcrAll,
  onRemove,
  onOpen,
}: {
  attachments: Attachment[];
  /** Current redaction engine signature — a chip redacted with another shows « reredact ». */
  currentRedactSig?: string;
  onRetry?: (cid: string) => void;
  /** « Lire tout » — relire un PDF dont l'OCR s'est arrêté au plafond (`ocrShortfall`). */
  onOcrAll?: (cid: string) => void;
  onRemove: (index: number) => void;
  onOpen: (cid: string) => void;
}) {
  return (
    <div className="attach-chips">
      {attachments.map((a, i) => {
        // The file was redacted with a DIFFERENT engine than the one now
        // selected (the user switched redaction model/engine since attaching).
        const engineChanged =
          !!a.redactEngineSig && !!currentRedactSig && a.redactEngineSig !== currentRedactSig;
        const showRerun = !a.redacting && !!onRetry && (!!a.redactError || engineChanged);
        // OCR arrêté au plafond : le chip le DIT toujours ; le geste « Lire tout »
        // n'apparaît que si l'hôte sait relire (extractAll) et que le fichier a un
        // chemin (un déposé sans chemin garde le marqueur dans son texte).
        const shortfall = !a.redacting && ocrShortfall(a);
        const showOcrAll = !!shortfall && !!onOcrAll && !!a.path;
        // An image stays viewable even when text OCR failed (the picture itself is
        // fine) — so don't let its `error` block the preview. Its bytes may come from
        // a granted PATH or be held in memory (a drop / a Bibliothèque re-attach has
        // only the latter): asking for `path` alone made a dropped image's chip inert,
        // with nothing to click and nothing said.
        const openable =
          !a.redacting && !a.extracting && (a.kind === "image" ? !!a.path || !!a.data : !a.error);
        const open = () => openable && onOpen(a.cid);
        return (
          // ⚠️ Un `span` cliquable est INVISIBLE au clavier et au lecteur d'écran : la
          // seule porte vers l'aperçu — donc vers la vérification de ce qui sera masqué
          // avant l'envoi — ne s'ouvrait qu'à la souris (constat 15/08). Pas un vrai
          // <button> : le chip CONTIENT des boutons (relire, reredact, retirer), et
          // les imbriquer est invalide. Donc le trio role/tabIndex/clavier, à la main.
          <span
            key={i}
            role="button"
            tabIndex={0}
            aria-label={`${a.name} — ${openable ? "consulter le fichier" : "fichier en cours de traitement"}`}
            aria-disabled={!openable || undefined}
            className={`attach-chip ${a.error || a.redactError ? "err" : engineChanged ? "stale" : ""}`}
            title={
              a.error
                ? a.error
                : a.redactError
                  ? a.redactError
                  : a.redacting
                    ? "Redaction en cours…"
                    : engineChanged
                      ? "Redacted avec vos anciens réglages — reredact pour appliquer les réglages actuels"
                      : "Consulter le fichier"
            }
            onClick={open}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault(); // l'espace ne doit pas défiler la page
                open();
              }
            }}
          >
            {/* Tone TILE + two-line body; the redaction progress veils the tile
                (CSS clip via --attach-progress); `loading` pulses while the file is
                being extracted or analysed. */}
            <span
              className={`attach-tile${a.kind === "image" ? " image" : ""}${a.redacting ? " redacting" : ""}${a.extracting || a.redacting ? " loading" : ""}`}
              aria-hidden="true"
              style={
                a.redacting && a.redactProgress && a.redactProgress.total > 0
                  ? ({ "--attach-progress": `${Math.round((a.redactProgress.done / a.redactProgress.total) * 100)}%` } as CSSProperties)
                  : undefined
              }
            >
              <FileIcon size={17} />
            </span>
            <span className="attach-body">
              <span className="attach-name">{a.name}</span>
              <span className="attach-meta">
                {a.error
                  ? a.error
                  : a.extracting
                    ? a.extractProgress && a.extractProgress.total > 1
                      ? // OCR paginé : dire la page en cours vaut mieux qu'un pourcentage
                        // (l'utilisateur voit son document, il pense en pages).
                        `📄 OCR… page ${Math.min(a.extractProgress.done + 1, a.extractProgress.total)}/${a.extractProgress.total}`
                      : a.extractProgress
                        ? "📄 lecture de l'image…"
                        : "📄 extraction…"
                    : a.redacting
                      ? a.redactProgress && a.redactProgress.total > 1
                        ? `⏳ redaction… ${Math.round((a.redactProgress.done / a.redactProgress.total) * 100)}%`
                        : "⏳ redaction…"
                      : a.redactError
                        ? "⚠ échec"
                        : shortfall
                          ? `📄 ${shortfall.read}/${shortfall.total} pages lues`
                          : engineChanged
                          ? "↻ réglages modifiés"
                          : a.redactPreview > 0
                            ? // The unit matters on a chip this small: « 🛡 10 » read as a
                              // file count / a page number as often as a redaction count.
                              `🛡 ${a.redactPreview} valeur${a.redactPreview > 1 ? "s" : ""}`
                            : a.kind}
              </span>
            </span>
            {showOcrAll && (
              <button
                className="attach-retry"
                aria-label={`Lire les ${shortfall!.total} pages`}
                title={`Seules les ${shortfall!.read} premières pages ont été lues (et donc redacted). Relire le document en entier — quelques secondes par page.`}
                onClick={(e) => {
                  e.stopPropagation();
                  onOcrAll!(a.cid);
                }}
              >
                <RefreshIcon size={13} />
              </button>
            )}
            {showRerun && (
              <button
                className="attach-retry"
                aria-label={a.redactError ? "Réessayer le redaction" : "Reredact"}
                title={
                  a.redactError
                    ? "Réessayer le redaction"
                    : "Reredact (moteur de redaction modifié)"
                }
                onClick={(e) => {
                  e.stopPropagation();
                  onRetry!(a.cid);
                }}
              >
                <RefreshIcon size={11} />
              </button>
            )}
            <button
              className="attach-x"
              aria-label="Supprimer"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(i);
              }}
            >
              ✕
            </button>
            {a.redacting && a.redactProgress && a.redactProgress.total > 1 && (
              <span className="attach-progress" aria-hidden="true">
                <span
                  className="attach-progress-fill"
                  // Dynamic width from data → the allowed inline-style exception.
                  style={{
                    width: `${Math.round((a.redactProgress.done / a.redactProgress.total) * 100)}%`,
                  }}
                />
              </span>
            )}
            {/* Extraction: DETERMINATE when the OCR reports its per-page progress
                (`files:ocr-progress` → extractProgress), INDETERMINATE otherwise (a
                format with no measurable steps, or a host that doesn't relay). */}
            {a.extracting && (
              <span className="attach-progress" aria-hidden="true">
                {a.extractProgress && a.extractProgress.total > 0 ? (
                  <span
                    className="attach-progress-fill"
                    // Dynamic width from data → the allowed inline-style exception.
                    style={{
                      width: `${Math.round((a.extractProgress.done / a.extractProgress.total) * 100)}%`,
                    }}
                  />
                ) : (
                  <span className="attach-progress-indet" />
                )}
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}
