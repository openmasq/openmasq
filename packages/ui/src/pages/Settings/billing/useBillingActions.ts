import { useCallback, useState } from "react";
import type { BillingHost } from "../../../host";
import { BillingApiError, billingErrorMessage } from "../../../state/billing";
import { useT } from "../../../i18n";

/** Fallback when a rejection isn't an Error with a message. */

/**
 * The four money GESTURES of the Paiement tab — checkout, in-place tier change, the
 * Stripe portal, and the tester-mode self-grant — with the `busy`/`error` pair they
 * all write.
 *
 * Extracted from `BillingTab.tsx` because it is logic, not presentation (root
 * convention: brain in `.ts`), and because the four share one shape that must not
 * drift: mark WHICH action is in flight so only that button spins, clear the error on
 * start, and surface the rejection's own message. Every `BillingHost` method REJECTS
 * with a user-facing message precisely so the tab can say why nothing opened — a
 * silent catch here would leave a dead button and no reason.
 *
 * `busy` is the action's id (`"portal"` or `tier:<slug>`), never a bare boolean: the
 * grid renders one card per tier and a boolean would spin all of them.
 */
export function useBillingActions(
  billing: BillingHost | undefined,
  refresh: () => Promise<void>,
  pollRefresh: (times?: number) => void,
) {
  const t = useT();
  const [busy, setBusy] = useState<string | null>(null);
  // A user-facing reason the last checkout/portal/change action opened nothing (signed
  // out, already subscribed, no Stripe customer, backend error) — so the button never
  // fails silently. Cleared when a new action starts.
  const [error, setError] = useState<string | null>(null);

  /** Run one host call under the shared busy/error discipline. */
  const run = useCallback(async (id: string, fn: () => Promise<void>) => {
    setBusy(id);
    setError(null);
    try {
      await fn();
    } catch (e) {
      // A `BillingApiError` carries status + code: the phrase is chosen HERE, in the
      // UI's language. Any other error keeps its own message; with no message, the generic one.
      setError(
        e instanceof BillingApiError
          ? billingErrorMessage(e.status, t, e.code)
          : e instanceof Error && e.message
            ? e.message
            : t.billing.errors.generic,
      );
    } finally {
      setBusy(null);
    }
  }, [t]);

  const checkout = useCallback(
    (tier: string) => {
      if (!billing) return;
      return run(`tier:${tier}`, async () => {
        await billing.startCheckout(tier);
        // The plan flips after the webhook; poll so it appears without a manual
        // refresh even if the deep-link return is missed.
        pollRefresh();
      });
    },
    [billing, run, pollRefresh],
  );

  const changeTier = useCallback(
    (tier: string) => {
      if (!billing?.changeTier) return;
      return run(`tier:${tier}`, async () => {
        await billing.changeTier?.(tier);
        await refresh();
        pollRefresh(3);
      });
    },
    [billing, run, refresh, pollRefresh],
  );

  const portal = useCallback(() => {
    if (!billing) return;
    return run("portal", () => billing.openPortal());
  }, [billing, run]);

  // TESTER mode: neither Stripe nor a browser — the tier is set server-side, which reads
  // the global switch itself. `"free"` is the WITHDRAWAL (testable in both directions).
  const selfGrant = useCallback(
    (tier: string) => {
      if (!billing) return;
      return run(`tier:${tier}`, async () => {
        if (tier === "free") await billing.selfRevoke?.();
        else await billing.selfGrant?.(tier);
        await refresh();
      });
    },
    [billing, run, refresh],
  );

  return { busy, error, setError, checkout, changeTier, portal, selfGrant };
}
