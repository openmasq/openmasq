import { ModalShell } from "../../containers/modals/ModalShell";
import { TrashIcon } from "../brand";
import { useT } from "../../i18n";
/**
 * Confirm a destructive action — reference redact styling: a red-soft icon, a
 * display-face title, and a footer with cancel + (danger) confirm. Escape /
 * scrim / "Cancel" dismiss without confirming.
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
  /** Absent ⇒ « Supprimer » : la boîte est celle d'une action destructrice. */
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useT();
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
          {cancelLabel ?? t.common.cancel}
        </button>
        <button className={danger ? "btn-danger" : "btn-primary"} autoFocus onClick={onConfirm}>
          {confirmLabel ?? t.common.delete}
        </button>
      </div>
    </ModalShell>
  );
}
