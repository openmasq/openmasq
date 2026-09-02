import { useEffect, useState } from "react";
import { ModalShell } from "../ModalShell";
import { useHost } from "../../../host";
import { useAskAction, ASK_LABEL } from "./useAskAction";
import { ShieldIcon, IconButton, XIcon, DownloadIcon, MessageIcon } from "../../../components/brand";
import { FileViewerBody, type LoadedFile } from "./FileViewerBody";
import { Switch } from "../../../components/brand";
import { storedKinds, storedReplacements } from "./pdf/storedReplacements";
import { fmtSize, kindOf, maskedLabels, tileLabel } from "./fileKind";

import { useT } from "../../../i18n";
type Loaded = LoadedFile;

/**
 * In-app preview of a stored file — **ONE view, the redacted**: what left the machine.
 *
 * There is no « Aperçu » tab any more. It was a second VERSION of the same document, and
 * having it meant every reader had to ask which one they were looking at — on the one
 * surface whose whole job is to answer that. Nothing is hidden by dropping it: the
 * redacted view IS the document, with the masked values boxed over it, and a box opens
 * on hover. A file with nothing scrubbed simply shows itself, and the « Données masquées »
 * line stays away — the UI never claims a masking that did not happen.
 *
 * The tab bar therefore survives only for the caller's OWN tabs (the library's
 * « Conversations » usage panel) and disappears when there are none.
 * Loads bytes from the local DB behind a `FileSkeleton`.
 */
export function FileViewerModal({
  id,
  name,
  mime = "",
  onClose,
  extraTabs,
  vault,
  kinds,
  redacted,
  panel = false,
  onAsk,
  loadFile,
  onOpenExternal,
  storageLabel: storageLabelProp,
  redactedView = true,
}: {
  id: string;
  name: string;
  mime?: string;
  onClose: () => void;
  /** Caller-supplied tabs beside the document — e.g. the library's « Conversations » usage
   *  panel. A LIST, because a file can legitimately have more than one and a single
   *  slot forced a choice between them. `count` is the caller's fact; `id` is what the
   *  tab bar keys on, never the index. */
  extraTabs?: { id: string; label: React.ReactNode; node: React.ReactNode; count?: number }[];
  /** Where the BYTES come from. Default: the local DB (`host.db.loadFile(id)`), i.e. a
   *  stored file. A caller with another source — a file living in a folder the user
   *  granted, read through `host.localFs` — supplies its own loader, so the SAME viewer
   *  serves both instead of a second preview surface existing. */
  loadFile?: () => Promise<LoadedFile | null>;
  /** Hand the file to the OS. Default: `host.db.openFile(id)` (a stored file). */
  onOpenExternal?: () => void;
  /** The header's second line — where this file actually lives. */
  storageLabel?: string;
  /** Conversation vault (fake→original) + kinds — the FALLBACK the viewers rebuild from
   *  when the file carries no stored drop-time map (`extraction.redactions`) — used to rebuild
   *  the redacted overlay from the ALREADY-SENT redaction (no fresh model call). */
  vault?: Record<string, string>;
  kinds?: Record<string, string>;
  /** The file carries a redacted version (drives the masked-items summary). */
  redacted?: boolean;
  /** Kit: render as an inline right-side PANEL (the library's split detail) instead
   *  of a modal — same content, no scrim. */
  panel?: boolean;
  /** Kit « Demander » — hand the file to a conversation (reattach + navigate). */
  onAsk?: () => void | Promise<unknown>;
  /** `false` = show the ORIGINAL, no redaction pass. For a file that has never been
   *  SENT anywhere (a local folder's file — `LocalFilePanel`), the redacted view is a
   *  lie twice over: nothing was masked because nothing left the machine, and deriving
   *  the overlay live means a FULL NER pass over the document BEFORE the first paint —
   *  seconds of blank skeleton on open (the reported « lent comme s'il était
   *  masqué »). Default `true`: a STORED file's redacted view is the product. */
  /** INITIAL state of the Redacted ⇄ Original toggle (default: redacted). */
  redactedView?: boolean;
}) {
  const t = useT();
  const host = useHost();
  const [data, setData] = useState<Loaded | null | "error">(null);
  // "redacted" (the document) | an extra tab's id. No longer a VERSION choice — the
  // document has one version here.
  const [tab, setTab] = useState<string>("redacted");
  // The Redacted ⇄ Original toggle (requested 14/08): a SWITCH in the note
  // row, not a tab — the same gesture for PDF, image, spreadsheet and text. ALWAYS
  // opens on the redacted (the safe version to have on screen); showing the original
  // is a deliberate click, which doesn't survive reopening.
  const [showRedacted, setShowRedacted] = useState(redactedView);

  const kind = kindOf(mime, name);
  // Attaching a local file takes seconds (read + OCR): `useAskAction` makes
  // that wait visible and forbids the second click that used to double the work.
  const ask = useAskAction(onAsk);

  useEffect(() => {
    let alive = true;
    const dbLoad = host.db?.loadFile;
    const load = loadFile ?? (dbLoad ? () => dbLoad(id) : null);
    if (!load) {
      setData("error");
      return;
    }
    load()
      .then((d) => alive && setData((d as Loaded) ?? "error"))
      .catch(() => alive && setData("error"));
    return () => {
      alive = false;
    };
  }, [id, host, loadFile]);

  const openExternal =
    onOpenExternal ?? (host.db?.openFile ? () => void host.db?.openFile?.(id) : undefined);
  // THIS file's categories (stored drop-time map) when we have them — the whole
  // conversation's used to name things absent from the document.
  const stored =
    data && data !== "error" ? storedReplacements(data.extraction?.redactions) : undefined;
  const fileKinds = storedKinds(stored);
  // The row + toggle exist as soon as the viewer CAN paint a redaction: the meta
  // flag (redacted bytes or count) OR a stored drop-time map — a caller
  // that can't say `redacted` (meta not found) must not hide a real masking.
  const redaction = !!redacted || !!stored?.length;
  const labels = redaction ? maskedLabels(fileKinds ?? kinds) : "";

  const body = (
    <FileViewerBody
      data={data}
      kind={kind}
      name={name}
      mime={mime}
      showRedacted={redaction ? showRedacted : false}
      vault={vault}
      kinds={kinds}
      onOpenExternal={openExternal}
    />
  );

  const activeExtra = (extraTabs ?? []).find((t) => t.id === tab);
  const storageLabel = storageLabelProp ?? t.viewers.storedLocally;
  const sizeLine =
    data && data !== "error" ? `${fmtSize(data.original.byteLength)} · ${storageLabel}` : storageLabel;

  // Images (e.g. a seaborn/matplotlib plot) need room — a chart is unreadable in the
  // default text-document width; a SPREADSHEET likewise wants the extra width for its
  // columns (the grid scrolls inside, but a wider panel shows more at once). A plain-TEXT
  // document renders as document PAGES (DocText) — portrait sheets on a grey desk — so it
  // also wants the extra width to fit a full page at a readable size. All open much wider
  // than the old default text width.
  const isImage = kind === "image";
  const isWide = isImage || kind === "sheet" || kind === "text";
  return (
    <ModalShell
      onClose={onClose}
      width={isWide ? "min(1200px, 94vw)" : "720px"}
      maxHeight={isImage ? "94vh" : "88vh"}
      panel={panel}
    >
      <div className="fv-head">
        <span className={`fv-tile kind-${kind}`}>{tileLabel(kind, name)}</span>
        <div className="fv-head-main">
          <div className="fv-title" title={name}>
            <span className="om-mark">{name}</span>
          </div>
          <div className="fv-sub">{sizeLine}</div>
        </div>
        {onAsk && (
          // Deliberately DISCREET (a ghost, not the kit's primary): asking is a
          // side action here, not the viewer's main job. `fv-ask` = the kit's
          // compact 30px pill.
          <button
            type="button"
            className="fv-ask"
            onClick={ask.run}
            disabled={ask.state === "pending"}
            aria-busy={ask.state === "pending"}
          >
            <MessageIcon size={14} /> {ASK_LABEL[ask.state]}
          </button>
        )}
        {openExternal && (
          <IconButton size="sm" label={t.viewers.openExternal} onClick={openExternal}>
            <DownloadIcon size={16} />
          </IconButton>
        )}
        {/* Panel mode (kit): NO close button — the rail's tab ✕ owns closing. */}
        {!panel && (
          <button type="button" className="fv-close" onClick={onClose} title={t.viewers.closeTip} aria-label={t.viewers.close}>
            <XIcon size={20} />
          </button>
        )}
      </div>

      {/* The tab bar is no longer a VERSION switch — there is one version now, the
          redacted. It only survives for the caller's own tabs (« Conversations »), and
          disappears entirely when there are none. */}
      {(extraTabs ?? []).length > 0 && (
        <div className="fv-tabs">
          <button
            className={`fv-tab ${tab === "redacted" ? "on" : ""}`}
            title={t.viewers.sharedVersion}
            onClick={() => setTab("redacted")}
          >
            <ShieldIcon size={13} /> {t.viewers.documentTab}
          </button>
          {(extraTabs ?? []).map((t) => (
            <button
              key={t.id}
              className={`fv-tab ${tab === t.id ? "on" : ""}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
              {/* Real count or nothing — never a fabricated 0 while the query is in flight. */}
              {t.count !== undefined && <span className="fv-tab-n">{t.count}</span>}
            </button>
          ))}
        </div>
      )}

      {activeExtra ? (
        <div className="fv-body">{activeExtra.node}</div>
      ) : (
        <>
          {/* One slim NOTE line (no buttons) saying what is masked. Only when something
              WAS masked — on a file with nothing scrubbed the line would claim a
              protection that did not happen. */}
          {redaction && (
            <div className="fv-seg-row">
              <span className={`fv-seg-note ${showRedacted ? "fv-seg-masked" : "fv-seg-clear"}`}>
                <ShieldIcon size={12} />
                {showRedacted
                  ? labels
                    ? t.viewers.maskedNote(labels)
                    : t.viewers.maskedNoteNoLabels
                  : t.viewers.originalNote}
              </span>
              {/* A <span>, not a <label>: the Switch is a button[role=switch], which a
                  label doesn't relay — the word is a label, the switch is the gesture. */}
              <span className="fv-seg-toggle">
                {t.viewers.redactedToggle}
                <Switch checked={showRedacted} onChange={setShowRedacted} />
              </span>
            </div>
          )}
          <div className="fv-body">{body}</div>
        </>
      )}
    </ModalShell>
  );
}
