import { useCallback, useRef, useState, type ReactNode } from "react";
import { useT } from "../../i18n";
import { useHost } from "../../host";
import type { DeferredFile } from "../../state/deferredFile";
import { bytesToBase64 } from "../../state/bytes";
import { FolderIcon } from "../../components/brand";
import {
  FOLDER_OFFER_NOTE,
  dragCarriesFiles,
  folderOfferText,
  readDrop,
  type DroppedFolder,
} from "./dropIntake";
import { deferDroppedFile } from "./extractDropped";
import { grantDroppedFolder, grantMessage } from "./grantDroppedFolder";

/**
 * Glisser-déposer sur une conversation. Wraps the chat area, paints the overlay while a
 * drag is over it, and routes the drop.
 *
 * Presentation + wiring only — every decision is in a sibling `.ts` and unit-tested:
 * `dropIntake` (file vs folder), `extractDropped` (bytes, never a path), `grantDroppedFolder`
 * (the grant is what the SYSTEM dialog returns). Read `dropIntake.ts` before changing the
 * routing: the two branches are shaped by two security invariants, not by taste.
 *
 * ⚠️ The folder card is an OFFER, not the authorisation. Clicking it opens the native
 * picker; the user confirms there. the app cannot grant itself a folder, and the card says so
 * — `FOLDER_OFFER_NOTE` and the invariant are deliberately tied.
 */
export function DropZone({
  children,
  onFiles,
  disabled,
}: {
  children: ReactNode;
  /** Les fichiers déposés, sous la forme DIFFÉRÉE du shell : le chip paraît avant la
   *  lecture (« un fichier joint PARAÎT avant d'être lu »), l'OCR remplit ensuite.
   *  L'échec d'extraction est PAR FICHIER, porté par le chip — plus de bannière de lot. */
  onFiles(files: DeferredFile[]): void;
  /** No drop while the composer can't take one (a read-only or projected transcript). */
  disabled?: boolean;
}) {
  const t = useT();
  const host = useHost();
  const [over, setOver] = useState(false);
  const [offer, setOffer] = useState<DroppedFolder[]>([]);
  const [granting, setGranting] = useState(false);
  // ⚠️ A grant outcome gets its OWN notice, next to the card that produced it — filing it
  // as an attachment failure (« Pièce jointe ignorée ») was a message about folder access
  // under the wrong title. File-extraction failures ride the CHIP itself now.
  const [grantNotice, setGrantNotice] = useState<string | null>(null);
  // `dragenter`/`dragleave` fire for every child element, so a plain boolean flickers as
  // the pointer crosses the transcript. Counting entries is the standard fix.
  const depth = useRef(0);

  const canDrop = !disabled && !!host.files?.extractBytes;

  const onDragEnter = useCallback(
    (e: React.DragEvent) => {
      if (!canDrop || !dragCarriesFiles([...e.dataTransfer.types])) return;
      depth.current++;
      setOver(true);
    },
    [canDrop],
  );

  const onDragLeave = useCallback(() => {
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) setOver(false);
  }, []);

  const onDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!canDrop || !dragCarriesFiles([...e.dataTransfer.types])) return;
      // Without BOTH preventDefault calls the browser navigates to the dropped file.
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    },
    [canDrop],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      depth.current = 0;
      setOver(false);
      if (!canDrop) return;
      e.preventDefault();
      const intake = readDrop(
        [...e.dataTransfer.items],
        [...e.dataTransfer.files],
        host.files?.pathForFile,
      );
      if (intake.folders.length) {
        setGrantNotice(null);
        setOffer(intake.folders);
      }
      if (!intake.files.length) return;
      // Mise en scène IMMÉDIATE : chaque fichier part en DeferredFile — le chip paraît
      // dès le drop, l'extraction (et sa progression OCR) le remplit. L'échec reste PAR
      // FICHIER, porté par le chip (`stageDeferredFile`), plus jamais par une bannière
      // qui jetait le lot entier.
      onFiles(
        intake.files.map((file) =>
          deferDroppedFile(file, {
            extractBytes: host.files!.extractBytes!,
            toBase64: bytesToBase64,
          }),
        ),
      );
    },
    [canDrop, host.files, onFiles],
  );

  const acceptOffer = async () => {
    if (granting) return;
    setGranting(true);
    try {
      // One dialog per dropped folder, in order — a single dialog cannot express
      // "authorise these three", and silently granting the rest would defeat the point.
      // Read the connector list FRESH rather than from a prop: the offer can sit on
      // screen while the user adds folders in Réglages, and a stale list would silently
      // revoke them (`setDirs` replaces the set).
      const servers = (await host.mcp?.list().catch(() => [])) ?? [];
      for (const folder of offer) {
        const outcome = await grantDroppedFolder({ mcp: host.mcp, servers }, folder.hintPath, t);
        const message = grantMessage(outcome);
        if (message) setGrantNotice(message);
        // A cancelled dialog is the user declining THIS folder; stop rather than marching
        // through the remaining ones with more dialogs they did not ask for.
        if (outcome.status === "cancelled") break;
      }
    } finally {
      setGranting(false);
      setOffer([]);
    }
  };

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col"
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {children}

      {over && (
        <div className="drop-overlay" aria-hidden>
          <div className="drop-overlay-card">
            <FolderIcon size={22} />
            <div>
              <div className="drop-overlay-title">{t.composer.drop.title}</div>
              <div className="drop-overlay-sub">{t.composer.drop.sub}</div>
            </div>
          </div>
        </div>
      )}

      {grantNotice && (
        <div className="drop-offer" role="status">
          <div className="drop-offer-body">
            <div className="drop-offer-note">{grantNotice}</div>
          </div>
          <div className="drop-offer-actions">
            <button type="button" className="btn-ghost btn-inline" onClick={() => setGrantNotice(null)}>
              {t.composer.drop.close}
            </button>
          </div>
        </div>
      )}

      {offer.length > 0 && (
        <div className="drop-offer" role="dialog" aria-label={t.composer.drop.folderDialog}>
          <div className="drop-offer-body">
            <div className="drop-offer-title">{folderOfferText(offer)}</div>
            <p className="drop-offer-note">{FOLDER_OFFER_NOTE}</p>
          </div>
          <div className="drop-offer-actions">
            <button type="button" className="btn-ghost btn-inline" onClick={() => setOffer([])}>
              Non
            </button>
            <button
              type="button"
              className="btn-primary btn-inline"
              disabled={granting}
              onClick={() => void acceptOffer()}
            >
              {granting ? t.conversation.opening : t.conversation.chooseFolder}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
