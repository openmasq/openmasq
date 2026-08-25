/**
 * The page-world snippet that dismisses a cookie/consent banner, isolated so its
 * selection logic (WHICH element it clicks) is unit-testable without a live browser.
 *
 * Weak models get STUCK on consent walls — the reported Boursorama loop where the model
 * hovered « Tout accepter » for many turns without ever clicking. After a page settles the
 * agent browser evaluates this in the page world (`agentMain.ts`) to clear the wall.
 *
 * Safety: it clicks a KNOWN consent-manager button (reject / continue-without FIRST for
 * privacy, else accept-all to unblock), then a generic pass that only considers buttons
 * INSIDE a consent-ish container AND whose whole visible text is a short consent verb — so
 * it can never click an unrelated page button (a "Subscribe"/"Buy"). It returns `true` on a
 * click, `false` otherwise, and is wrapped in try/catch so it FAILS OPEN (a throw leaves the
 * page untouched). Runs in the ISOLATED agent process (no IPC in that world).
 */
export const CONSENT_DISMISS_JS = `(() => { try {
  const vis = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const hit = (el) => { if (!vis(el)) return false; el.click(); return true; };
  const IDS = [
    '#onetrust-reject-all-handler', '.ot-pc-refuse-all-handler',
    '#didomi-notice-disagree-button', '.didomi-continue-without-agreeing',
    '#CybotCookiebotDialogBodyButtonDecline',
    '.qc-cmp2-summary-buttons button[mode="secondary"]',
    '#onetrust-accept-btn-handler', '#didomi-notice-agree-button',
    '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll', '#CybotCookiebotDialogBodyButtonAccept',
    '.qc-cmp2-summary-buttons button[mode="primary"]'
  ];
  for (const s of IDS) { try { if (hit(document.querySelector(s))) return true; } catch (e) {} }
  const CONTAINER = '[id*="consent" i],[class*="consent" i],[id*="cookie" i],[class*="cookie" i],[class*="cmp" i],[aria-label*="cookie" i],[role="dialog"]';
  const RE = /^(tout accepter|tout refuser|continuer sans accepter|j.?accepte|je refuse|accepter (et |& )?(fermer|continuer)|accept all|reject all|i accept|i agree|agree and close|allow all|got it)$/i;
  for (const c of document.querySelectorAll(CONTAINER)) {
    for (const b of c.querySelectorAll('button,[role="button"],a')) {
      const t = (b.textContent || '').trim();
      if (t && t.length < 40 && RE.test(t)) { try { if (hit(b)) return true; } catch (e) {} }
    }
  }
  return false;
} catch (e) { return false; } })()`;
