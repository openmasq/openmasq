import { useMemo, useState } from "react";
import { useT } from "../../../i18n";
import type { Conversation } from "../../../types";
import { AuditRedactionView } from "./AuditRedactionView";
import { EgressLogCard } from "./EgressLogCard";
import { MemoryExportRow } from "../../Memory";

/**
 * The **Journal** tab — both halves of the same promise, behind ONE selector:
 * what has been redacted (« Masquage ») and the addresses actually contacted
 * (« Réseau »).
 *
 * ⚠️ They used to be STACKED, network under redaction. But the redaction table
 * loads in pages of 40 on an `IntersectionObserver` sentinel: reaching the bottom
 * lengthens the list, indefinitely. The network journal was therefore, literally,
 * unreachable — present in the DOM, out of scrolling's reach. One view at a time,
 * and each is one click away.
 */
type View = "redaction" | "network";

export function AuditLogTab({
  conversations,
  onOpenMessage,
}: {
  conversations: Conversation[];
  onOpenMessage?: (convId: string, msgId?: string) => void;
}) {
  const t = useT();
  const [view, setView] = useState<View>("redaction");
  // The « Masquage » segment's counter: what the view will show, computed here so
  // the label doesn't lie before it's even opened.
  const protectedTotal = useMemo(
    () => conversations.reduce((n, c) => n + Object.keys(c.redactionVault ?? {}).length, 0),
    [conversations],
  );

  return (
    <>
      <div className="settings-section">
        <div className="om-seg" role="tablist" aria-label={t.privacyTab.auditAria}>
          <button
            type="button"
            role="tab"
            aria-selected={view === "redaction"}
            className={`om-seg-btn${view === "redaction" ? " on" : ""}`}
            onClick={() => setView("redaction")}
          >
            {t.privacyTab.auditRedaction}
            <span className="om-seg-n">{protectedTotal}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "network"}
            className={`om-seg-btn${view === "network" ? " on" : ""}`}
            onClick={() => setView("network")}
          >
            {t.privacyTab.auditNetwork}
          </button>
        </div>
      </div>

      {view === "redaction" ? (
        <AuditRedactionView conversations={conversations} onOpenMessage={onOpenMessage} />
      ) : (
        <EgressLogCard />
      )}
      {/* The Mémoire's diagnostic export (cards + semantic links, local file) — a
          transparency artifact, so it sits with the journal, not on the Mémoire page. */}
      {view === "redaction" && <MemoryExportRow />}
    </>
  );
}
