import { FeedbackIcon, HelpIcon, RefreshIcon } from "../../components/brand";
import { BRAND } from "@openmasq/branding";

import { useT } from "../../i18n";

/**
 * The right rail's FOOT — everything that is NOT a deposit: the waiting update, « Aide »
 * and « Envoyer un avis ». ⚠️ No panel command here (expand / close): re-clicking the
 * ACTIVE tab collapses, every item has its own cross — only add one back if a gesture
 * becomes unreachable. ONE list for both renders (narrow icons / labelled rows),
 * otherwise a label gets lost on one side.
 */

/** A FOOT entry, rendered either as an icon (narrow rail) or a labelled row (wide view). */
interface FootItem {
  key: string;
  icon: JSX.Element;
  label: string;
  title: string;
  onClick: () => void;
}

export interface FootActions {
  /** Reopen the announcement of a DOWNLOADED update — only while one waits for a restart. */
  onOpenUpdate?: () => void;
  /** The ready version, to NAME it ("Restart for 0.5.1"). */
  updateVersion?: string | null;
  /** Open « Aide » (the in-app guide). */
  onOpenGuide: () => void;
  /** Open « Votre avis ». Absent (no `host.avis`) ⇒ not rendered at all. */
  onOpenFeedback?: () => void;
}

function useFootItems({ onOpenUpdate, updateVersion, onOpenGuide, onOpenFeedback }: FootActions): FootItem[] {
  const t = useT();
  return [
    // The update FIRST, only when there is one — last, it slid under the fold of the
    // narrow rail for whoever also has « Envoyer un avis ».
    ...(onOpenUpdate && updateVersion
      ? [
          {
            key: "update",
            icon: <RefreshIcon size={17} />,
            label: t.chrome.updateReady(updateVersion),
            title: t.chrome.updateReadyTip(BRAND.name, updateVersion),
            onClick: onOpenUpdate,
          },
        ]
      : []),
    { key: "guide", icon: <HelpIcon size={17} />, label: t.chrome.help, title: t.chrome.helpTip(BRAND.name), onClick: onOpenGuide },
    ...(onOpenFeedback
      ? [{ key: "avis", icon: <FeedbackIcon size={17} />, label: t.chrome.sendFeedback, title: t.chrome.sendFeedback, onClick: onOpenFeedback }]
      : []),
  ];
}

/** The foot's buttons, as narrow icons or wide labelled rows. A single parameterized
 *  render: the update's accent must be identical on both sides. */
export function RailFoot({ wide, ...actions }: FootActions & { wide: boolean }) {
  return (
    <>
      {useFootItems(actions).map((f) => (
        <button
          key={f.key}
          type="button"
          className={`${wide ? "rr-foot-row" : "rail-btn"}${f.key === "update" ? " rr-upd" : ""}`}
          title={f.title}
          aria-label={wide ? undefined : f.label}
          onClick={f.onClick}
        >
          {wide ? (
            <>
              <span className="rr-foot-ico" aria-hidden="true">{f.icon}</span>
              <span className="rr-foot-lbl">{f.label}</span>
            </>
          ) : (
            f.icon
          )}
        </button>
      ))}
    </>
  );
}
