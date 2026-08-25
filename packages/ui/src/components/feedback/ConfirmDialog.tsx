import { ModalShell } from "../../containers/modals/ModalShell";
import { TrashIcon } from "../brand";

/**
 * Confirm a destructive action — reference redact styling: a red-soft icon, a
 * display-face title, and a footer with cancel + (danger) confirm. Escape /
 * scrim / "Cancel" dismiss without confirming.
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Supprimer",
  cancelLabel = "Annuler",
  danger = true,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <ModalShell onClose={onCancel} width="420px">
      <div className="confirm-body">
        <span className="confirm-icon">
          <TrashIcon size={19} />
        </span>
        <h2 className="cv-display confirm-title">{title}</h2>
        <p className="confirm-text">{message}</p>
      </div>
      <div className="confirm-footer">
        <button className="btn-ghost" onClick={onCancel}>
          {cancelLabel}
        </button>
        <button className={danger ? "btn-danger" : "btn-primary"} autoFocus onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </ModalShell>
  );
}
