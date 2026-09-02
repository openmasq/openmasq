import { Toast } from "../../components/feedback/Toast";
import { useT } from "../../i18n";

/**
 * The composer's transient notice. SEND failures (missing key, rate limit, generic
 * error) are not shown here: they persist INLINE on the failed assistant bubble (with
 * "Réessayer" + any CTA). The only thing left is the attachment warning — a composer-side
 * notice, not a send error — and being transient it is THE toast (components/CLAUDE.md:
 * a toast passes, a chip stays, a modal blocks), docked above the composer and gone on
 * its own.
 */
export function ChatBanners({
  attachWarning,
  onDismissAttachWarning,
}: {
  attachWarning: string | null;
  onDismissAttachWarning: () => void;
}) {
  const t = useT();
  if (!attachWarning) return null;
  return (
    <Toast
      tone="warning"
      title={t.cards.banners.attachmentIgnored}
      message={attachWarning}
      duration={6000}
      onDone={onDismissAttachWarning}
    />
  );
}
