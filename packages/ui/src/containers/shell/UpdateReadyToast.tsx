import { BRAND } from "@openmasq/branding";
import { Toast } from "../../components/feedback/Toast";
import { useT } from "../../i18n";
import type { UpdateReadyApi } from "./hooks/useUpdateReady";

/**
 * « Mise à jour prête » — THE announcement of a downloaded version, once per version
 * (`hooks/useUpdateReady.ts` decides when). It passes on its own: nothing has to be decided
 * now, the build installs at the next restart. « Voir » opens the modal with the note and
 * « Redémarrer maintenant »; once the toast is gone, the right rail's button does the same.
 */
export function UpdateReadyToast({ update }: { update: UpdateReadyApi }) {
  const t = useT();
  if (!update.toast || !update.version) return null;
  const copy = t.modals.updateReady;
  return (
    <Toast
      tone="info"
      title={copy.toastTitle}
      message={copy.toastMessage(BRAND.name, update.version)}
      duration={8000}
      onDone={() => update.setToast(false)}
      action={{
        label: copy.toastAction,
        onClick: () => {
          update.setToast(false);
          update.setOpen(true);
        },
      }}
    />
  );
}
