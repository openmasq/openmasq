import { ModalShell } from "../../containers/modals/ModalShell";
import { TrashIcon } from "../brand";
import { useT } from "../../i18n";
/**
 * Confirm a destructive action — the house head (`ModalShell`'s `title` + a red-tinted
 * icon), the message, and a footer with cancel + (danger) confirm. Escape / scrim /
 * "Cancel" dismiss without confirming; the confirm button takes focus on open, and
 * the shell hands it back to the control that asked when the dialog closes.
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel,
  danger = true,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  /** Absent ⇒ « Supprimer »: the dialog is that of a destructive action. */
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  return (
    <ModalShell
      onClose={onCancel}
      width="420px"
      title={title}
      icon={<TrashIcon size={19} />}
      tone={danger ? "danger" : undefined}
    >
      <div className="confirm-body">
        <p className="confirm-text">{message}</p>
      </div>
      <div className="confirm-footer">
        <button className="btn-ghost" onClick={onCancel}>
          {cancelLabel ?? t.common.cancel}
        </button>
        <button className={danger ? "btn-danger" : "btn-primary"} autoFocus onClick={onConfirm}>
          {confirmLabel ?? t.common.delete}
        </button>
      </div>
    </ModalShell>
  );
}
