import { Banner } from "../../components/feedback/Banner";
import { useT } from "../../i18n";

/**
 * The bottom banner stack — full-bleed feedback above the composer. SEND failures
 * (missing key, rate limit, generic error) are no longer shown here: they persist
 * INLINE on the failed assistant bubble (with "Réessayer" + any CTA). The only
 * thing left is the transient attachment-warning toast (a composer-side notice,
 * not a send error), so this stays a thin, single-purpose banner.
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
    <div className="kb-stack">
      <Banner
        tone="warning"
        title={t.cards.banners.attachmentIgnored}
        message={attachWarning}
        onClose={onDismissAttachWarning}
      />
    </div>
  );
}
