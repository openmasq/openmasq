import { useState } from "react";
import type { McpConnector } from "@openmasq/catalog/mcp";
import { ModalShell } from "../../../containers/modals/ModalShell";
import { ArrowRightIcon, CheckIcon } from "../../../components/brand";
import { guideFor } from "./guides";
import {
  blocks,
  clientIdIssue,
  clientSecretIssue,
  familyLabel,
  sharedServices,
  type FieldIssue,
} from "./byoValidate";

import { useT } from "../../../i18n";
/**
 * "Mes clés" (BYO) setup for a desktop-direct connector: the per-provider
 * walkthrough (`./guides.tsx`), then the fields it needs. The shape is per
 * `directAuth`: GitHub (`device`) + Microsoft Entra (`microsoft`) are PUBLIC clients
 * → `client id` only; Google (`pkce`) also needs a `client secret`. The user's own
 * Google app in TEST mode unlocks the FULL scopes with no Google verification / no
 * CASA. Creds go to `host.mcp.connectDirect(id, { mode:"byo", … })` and are stored
 * encrypted in main.
 *
 * Two things this form does that a longer tutorial would not fix:
 *
 * - **The steps are a tickable CHECKLIST, all visible at once.** The cost here is not
 *   reading — it is that the user LEAVES the app four times (project → API → consent
 *   → credentials) and comes back not knowing where they were. So the ticks survive
 *   closing the modal, and they are shared by every connector of the same family
 *   (below). Not a wizard: hiding the remaining steps would take away the one thing
 *   that makes someone start — seeing that it is four steps and not forty.
 * - **The two fields are checked on paste**, against the shapes a value can be PROVEN
 *   to violate (`./byoValidate.ts`). Pasting the project id or an API key instead of
 *   the client id used to surface three screens later as a Google error page.
 */

/**
 * Which steps the user has ticked, per auth family — module-level on purpose.
 *
 * It must outlive the modal (the whole point is that they tab away to the provider's
 * console and come back), and it is worthless after a restart, so it is neither
 * component state nor a persisted setting — same shape as the write-gate's session
 * allow-lists. Keyed by FAMILY, not by connector: one Google client serves every
 * Google connector, so the work done for Gmail is already done for Drive.
 */
const ticked = new Map<string, Set<number>>();

function Issue({ issue }: { issue: FieldIssue }) {
  return <span className={`byo-issue ${issue.level}`}>{issue.message}</span>;
}

export function ByoKeysModal({
  connector,
  hasExisting,
  onSubmit,
  onClose,
}: {
  connector: McpConnector;
  /** The user's own client id/secret are ALREADY stored on this machine (the secret
   *  is never surfaced back). When true the form says so + can reuse them without
   *  re-entry — submitting blank keeps the saved keys. */
  hasExisting?: boolean;
  onSubmit: (creds: { clientId: string; clientSecret?: string }) => void | Promise<void>;
  onClose: () => void;
}) {
  const t = useT();
  const guide = guideFor(connector, t);
  const family = connector.directAuth ?? "other";
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Set<number>>(() => new Set(ticked.get(family) ?? []));

  const toggleStep = (i: number) =>
    setDone((prev) => {
      const next = new Set(prev);
      if (!next.delete(i)) next.add(i);
      ticked.set(family, next);
      return next;
    });

  const idIssue = clientIdIssue(connector.directAuth, clientId, t);
  const secretIssue = guide.needsSecret
    ? clientSecretIssue(connector.directAuth, clientSecret, t)
    : undefined;

  // Entering EITHER field means the user is replacing the saved keys → require a
  // FULL new pair. Blank-and-saved reuses the stored credential; blank-and-none
  // isn't submittable.
  const typing = clientId.trim().length > 0 || clientSecret.trim().length > 0;
  const complete =
    clientId.trim().length > 0 && (!guide.needsSecret || clientSecret.trim().length > 0);
  const reuse = !!hasExisting && !typing;
  const ready = (reuse || complete) && !blocks(idIssue) && !blocks(secretIssue);

  // "…and this same client will serve your other Google services" — the sentence that
  // turns a per-service chore into a one-off. Catalog-derived (`sharedServices`).
  const others = sharedServices(connector);
  const familyName = familyLabel(connector.directAuth);

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    try {
      // Blank fields + saved keys → send blanks; main reuses the stored credential.
      await onSubmit({
        clientId: clientId.trim(),
        clientSecret: guide.needsSecret ? clientSecret.trim() : undefined,
      });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell onClose={onClose} width="540px" maxHeight="88vh">
      <div className="rrm-head">
        <div className="cv-eyebrow rrm-eyebrow">{t.byo.eyebrow}</div>
        <h2 className="cv-display rrm-title">
          {t.byo.connect} <span className="rrm-hl">{connector.name}</span>
        </h2>
        <p className="rrm-sub">
          {guide.intro} {t.byo.encryptedNote}
        </p>
      </div>

      <div className="byo-body">
        {hasExisting ? (
          <div className="byo-saved">
            <span className="byo-saved-dot" aria-hidden="true" />
            <span>{t.byo.existing}</span>
          </div>
        ) : (
          others.length > 0 && (
            <div className="byo-saved">
              <span className="byo-saved-dot" aria-hidden="true" />
              <span>
                <strong>{t.byo.onceLead}</strong>
                {t.byo.onceTail(familyName, others.join(", "))}
              </span>
            </div>
          )
        )}

        <ol className="byo-steps">
          {guide.steps.map((s, i) => (
            <li key={i} className={done.has(i) ? "done" : undefined}>
              <button
                type="button"
                className="byo-tick"
                onClick={() => toggleStep(i)}
                aria-pressed={done.has(i)}
                aria-label={done.has(i) ? t.byo.stepDone(i + 1) : t.byo.stepTodo(i + 1)}
                title={t.byo.markDone}
              >
                {done.has(i) && <CheckIcon size={11} />}
              </button>
              <span className="byo-step-text">{s}</span>
            </li>
          ))}
        </ol>
        {guide.note && <p className="byo-hint">{guide.note}</p>}

        <div className="field">
          <span className="field-label">{t.byo.clientId}</span>
          <input
            type="text"
            value={clientId}
            autoFocus={!hasExisting}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={blocks(idIssue) || undefined}
            placeholder={hasExisting ? t.byo.keepPlaceholder : guide.idPlaceholder}
            onChange={(e) => setClientId(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !guide.needsSecret && submit()}
          />
          {idIssue && <Issue issue={idIssue} />}
        </div>
        {guide.needsSecret && (
          <div className="field">
            <span className="field-label">{t.byo.clientSecret}</span>
            <input
              type="password"
              value={clientSecret}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={blocks(secretIssue) || undefined}
              placeholder={hasExisting ? t.byo.keepPlaceholder : "GOCSPX-…"}
              onChange={(e) => setClientSecret(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
            {secretIssue && <Issue issue={secretIssue} />}
          </div>
        )}
      </div>

      <div className="confirm-footer">
        <button className="btn-ghost btn-inline" onClick={onClose}>
          {t.byo.cancel}
        </button>
        <button className="btn-primary btn-inline" onClick={submit} disabled={!ready || busy}>
          {busy ? t.byo.connecting : reuse ? t.byo.keepAndConnect : t.byo.connect}{" "}
          <ArrowRightIcon size={15} />
        </button>
      </div>
    </ModalShell>
  );
}
