import type { CreditBalance } from "../../host";
import type { Message } from "../../types";
import { ZapIcon, ClockIcon, ArrowRightIcon, KeyIcon } from "../brand";
import { AgentCard, GlyphTile, AgentCardTitle, AgentCardDesc } from "./AgentCard";
import { BRAND } from "@openmasq/branding";

import { useT } from "../../i18n";
/** Eurocents → "1,20 €". */
function euros(cents: number): string {
  return `${(cents / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

/** An ISO date → "1 août". Invalid/absent ⇒ null (never a fabricated date). */
export function resetLabel(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
}

/** Used / total → a 0-100 bar width. A zero/unknown allotment reads as FULL (the
 *  budget IS exhausted — that's why this card is on screen), never as an empty bar. */
export function usedPct(credits: CreditBalance | null | undefined): number {
  if (!credits || credits.allotmentCents <= 0) return 100;
  const pct = (credits.consumedCents / credits.allotmentCents) * 100;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

/**
 * "Your credits are exhausted" — shown UNDER an assistant bubble when a platform send was
 * blocked on credits AND the account is NOT paying (free tier). Design kit `CreditsCard`:
 * AMBER, informational, never error-red — the user did nothing wrong, they hit a limit.
 *
 * The figures are REAL (`store.personalCredits`, fetched eagerly on mount): used /
 * remaining / the progress bar, plus the reset date from the subscription's
 * `currentPeriodEnd`. Anything unknown is simply OMITTED — a plausible-looking but
 * invented amount or date on a billing surface would be worse than no number at all.
 *
 * Both CTAs delegate to the SHARED `onAction` with the existing `errorAction` kinds
 * (`upgrade_plan` → open Paiement / `missing_key` → open the key modal), so all the
 * downstream wiring (regenerate-after-save) is reused with NO new plumbing. Once a key is
 * saved for `provider` the send routes DIRECT and bypasses the credit gate. Pure
 * presentation.
 */
export function CreditsCard({
  assistantId,
  provider,
  label,
  credits,
  resetIso,
  onAction,
}: {
  assistantId: string;
  provider: string;
  label?: string;
  /** The account's REAL prepaid budget. Null = unknown → the figures are hidden. */
  credits?: CreditBalance | null;
  /** The subscription's `currentPeriodEnd` — when the budget resets. */
  resetIso?: string;
  onAction: (assistantId: string, action: NonNullable<Message["errorAction"]>) => void;
}) {
  const t = useT();
  const name = label ?? provider;
  const reset = resetLabel(resetIso);
  const pct = usedPct(credits);

  return (
    // Same family as the turn-status card: ONE slot under the reply, amber variant.
    <AgentCard
      className="turn-status turn-status--credits credits-card"
      eyebrow={t.turnStatus.eyebrow.limit}
      tile={
        <GlyphTile>
          <ZapIcon size={18} />
        </GlyphTile>
      }
      footer={
        <>
          {reset && (
            <span className="agent-card-note">
              <ClockIcon size={13} />
              <span>{t.turnStatus.credits.resetOn(reset)}</span>
            </span>
          )}
          <span className="agent-card-spacer" />
          <button
            className="btn-ghost btn-inline"
            onClick={() => onAction(assistantId, { kind: "missing_key", provider, label })}
            title={t.turnStatus.credits.useKeyTip(name)}
          >
            <KeyIcon size={14} /> {t.turnStatus.credits.useKey(name)}
          </button>
          <button
            className="btn-primary btn-inline"
            onClick={() => onAction(assistantId, { kind: "upgrade_plan" })}
          >
            {t.billing.ctaSee} <ArrowRightIcon size={14} />
          </button>
        </>
      }
    >
      <AgentCardTitle>{t.turnStatus.credits.title}</AgentCardTitle>
      <AgentCardDesc>{t.turnStatus.credits.desc(BRAND.name, name)}</AgentCardDesc>
      {/* Real figures only. No `credits` ⇒ no bar: the message stands on its own, and a
          made-up amount on a billing surface is worse than none. */}
      {credits && (
        <div className="credits-meter">
          <div className="credits-meter-row">
            <span className="credits-meter-used">{t.turnStatus.credits.used(euros(credits.consumedCents))}</span>
            <span className="credits-meter-left">
              {t.turnStatus.credits.left(euros(Math.max(0, credits.balanceCents)))}
            </span>
          </div>
          <div className="credits-meter-track">
            {/* Runtime-computed width — the inline-style case rule 6 allows. */}
            <div className="credits-meter-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}
    </AgentCard>
  );
}
