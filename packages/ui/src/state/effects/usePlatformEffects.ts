import { useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { Settings } from "../../types";
import type { Host, OrgProfileInfo } from "../../host";
import { setAnalyticsConsent } from "../../analytics";
import { connectedKeepList } from "../../send/redactKeep";
import { setDebugCapture } from "../debug";
import { load } from "../storePersistence";
import { saveDeviceTheme } from "../theme";
import { isNerWarmed, markNerWarmed } from "../nerWarm";
import { BRAND } from "@openmasq/branding";

const BROWSER_PRECONNECTED_KEY = `${BRAND.slug}:browser-preconnected`;

/**
 * Everything the store PUSHES to the platform, plus the two warm-ups and the connected-
 * integration keep-list. Peeled out of `store.ts` (rule 1).
 *
 * The grouping is "a setting the renderer must MIRROR outward, or a cost paid before the
 * user feels it" — not "leftover effects". Two of them are load-bearing beyond ergonomics:
 * `links.setEnabled` mirrors the opt-in to MAIN, which is the authoritative, fail-closed
 * flag (audit M4 — a renderer XSS must not be able to unfurl a link and leak the user's
 * IP), and the keep-list cache exists because `connectedKeepList` re-queries every
 * connected MCP server over the NETWORK.
 */
export function usePlatformEffects(p: {
  settings: Settings;
  host: Host;
  hostRef: MutableRefObject<Host>;
  setSettings: Dispatch<SetStateAction<Settings>>;
  orgProfile: OrgProfileInfo | null;
}): { keepListRef: MutableRefObject<string[]> } {
  const { settings, host, hostRef, setSettings, orgProfile } = p;

  // Mirror the ORG's confirmation FLOOR to main, exactly like the `linkPreviews` opt-in
  // below — main composes it with the member's own mode by taking the STRICTER
  // (`composeConfirmationMode`). That direction is what makes a renderer-supplied floor
  // sound: it can only ever ADD confirmations, never remove one. `null` clears it, so a
  // member who leaves the org is not left permanently locked into its posture.
  useEffect(() => {
    void host.mcp?.setOrgConfirmationFloor?.(orgProfile?.confirmationFloor ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- host is stable per platform
  }, [orgProfile?.confirmationFloor]);

  // Same mirror for the ALLOWED-connector list. The agent loop filters on it too, but that
  // filter is UX: main is where a custom-server re-add or a direct call-tool is refused.
  // ⚠️ On pousse `null` quand il n'y a PAS d'organisation, et le tableau (même vide) quand
  // il y en a une : main distingue « pas encore de politique » (porte ouverte) de « rien
  // d'ouvert » (porte fermée), et les confondre rouvrirait tout.
  // Les clés personnelles : `null` sans organisation (compte solo, rien à contraindre),
  // le booléen sinon. Même trois-états que la liste ci-dessous.
  useEffect(() => {
    void host.keys?.setOrgByoAllowed?.(orgProfile ? orgProfile.byoKeysAllowed !== false : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- host is stable per platform
  }, [orgProfile ? String(orgProfile.byoKeysAllowed) : "none"]);

  const allowedKey = orgProfile ? orgProfile.allowedMcpIds.join(",") : "\u0000none";
  useEffect(() => {
    void host.mcp?.setOrgAllowedConnectors?.(orgProfile ? orgProfile.allowedMcpIds : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- host is stable per platform
  }, [allowedKey]);

  // Capture debug entries (wire/tool/error) EN PERMANENCE (décision produit 13/08) :
  // le journal doit exister AVANT le bug pour qu'un retour « Votre avis » puisse
  // l'embarquer — l'activer après coup ne raconte plus rien. Borné (anneau de 200),
  // et son SEUL puits persistant reste la DB chiffrée (`attachDebugStore`).
  // `settings.debugLog` ne gate plus que la VISIBILITÉ : l'entrée « Journal de
  // débogage » du menu ⋯ et la trace console du wire.
  useEffect(() => {
    setDebugCapture(true);
  }, []);

  // Tri-state consent: an explicit user choice wins; otherwise default ON — in dev too,
  // so the app-attestation pipeline is exercised there. (Sending still requires a
  // configured relay, and Do-Not-Track / GPC is always honoured.)
  useEffect(() => {
    setAnalyticsConsent(settings.analyticsConsent ?? true);
  }, [settings.analyticsConsent]);

  // Mirror the `linkPreviews` opt-in to the platform (audit M4): main tracks it as the
  // AUTHORITATIVE flag (default OFF, fail-closed) and REFUSES `links:preview` until it is
  // on. Push on mount + on every change so main and the UI never drift.
  useEffect(() => {
    void host.links?.setEnabled?.(!!settings.linkPreviews);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- host is stable per platform
  }, [settings.linkPreviews]);

  // Apply the colour theme to <html> (the dark / blue / blue-dark token overrides key off
  // `data-theme`; light = no attribute).
  useEffect(() => {
    const root = document.documentElement;
    const t = settings.theme;
    if (t === "dark" || t === "blue" || t === "blue-dark") root.setAttribute("data-theme", t);
    else root.removeAttribute("data-theme");
    // Mirror to the DEVICE key: it is what the pre-paint pass and the signed-out scope
    // read, so recording it here is what makes the theme survive a sign-out or a cold
    // start. Account-scoped settings keep their own copy — this one is the machine's.
    if (t) saveDeviceTheme(t);
    // Tell the host what the WINDOW's own background should be — the contour at the
    // rounded corners, and the strip a resize exposes before this renderer repaints it.
    // Read COMPUTED, after the attribute is set, so the value is whatever the stylesheet
    // actually resolved: the hexes stay owned by `styles.css` alone (rule 9) — the host
    // holds no second copy — and a future theme needs no code here. Absent host slot
    // (web preview) ⇒ nothing to do.
    const tone = getComputedStyle(root).getPropertyValue("--surface-shell").trim();
    if (tone) void host.app?.setWindowTone?.(tone);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- host is stable per platform
  }, [settings.theme]);

  // Pre-connect the controllable BROWSER connector ONCE at first run, in READ-ONLY mode
  // by default (safe: the model may navigate + read, never click/type/submit). Gives the
  // assistant a baseline capability AND keeps the agentic loop live, so the
  // `suggest_integrations` connect-cards can surface. One-time + reversible: a persisted
  // flag guards it, so disabling the browser later sticks.
  useEffect(() => {
    if (!host.mcp?.enableBrowser) return; // desktop-only capability (absent in preview)
    if (load<boolean>(BROWSER_PRECONNECTED_KEY, false)) return;
    setSettings((s) => (s.browserReadOnly === undefined ? { ...s, browserReadOnly: true } : s));
    // Le drapeau ne se pose qu'APRÈS un enableBrowser résolu : posé avant, un échec au
    // premier montage devenait définitif et silencieux — plus aucune tentative, jamais.
    // (L'effet court AVANT l'adoption du compte, donc le spec écrit ici peut se perdre ;
    // le filet est côté main : `setMcpUser` recrée le spec d'un compte opté-in — c'est
    // LUI qui rend la pré-connexion effective, ceci n'est que le premier opt-in.)
    host.mcp
      .enableBrowser()
      .then(() => {
        try {
          localStorage.setItem(BROWSER_PRECONNECTED_KEY, JSON.stringify(true));
        } catch {
          /* private mode / quota — the effect just re-runs next launch, still idempotent */
        }
      })
      .catch(() => {
        /* best-effort : indisponible → on retentera au prochain lancement */
      });
  }, [host, setSettings]);

  // Pre-warm the on-device NER model whenever the local engine is active, so the FIRST
  // message never pays the one-time model load on the critical path (~1-3 s cold — the
  // delay users felt). Runs once per session; marking it warm keeps the `cold` telemetry
  // accurate for the first real send.
  useEffect(() => {
    if (settings.redactEngine !== "local") return;
    if (!host.detectLocalPii || isNerWarmed()) return;
    host
      .detectLocalPii({ text: BRAND.slug })
      .then(markNerWarmed)
      .catch(() => {
        /* model unavailable → the send path degrades to regex; nothing to do */
      });
  }, [settings.redactEngine, host]);

  // Cached redaction `keep` list (connected-integration names kept VERBATIM so the model
  // sees "Stripe"/"Slack", not a fake company). `connectedKeepList` calls
  // `host.mcp.listTools()`, which on desktop RE-QUERIES every connected MCP server over
  // the NETWORK — so calling it per keystroke-preview AND per send stalled EVERY message
  // by seconds once a remote connector was connected. The set only changes on
  // connect/disconnect, so recompute on mount + `mcp.onChanged` and cache it;
  // `detectPii`/`sendMessage` then read it synchronously. The `keepRefreshing` guard
  // swallows the `onChanged` that `connectedKeepList`'s own `listTools` re-fires (else it
  // would self-loop).
  const keepListRef = useRef<string[]>([]);
  const keepRefreshing = useRef(false);
  useEffect(() => {
    let alive = true;
    const refresh = () => {
      if (keepRefreshing.current) return;
      keepRefreshing.current = true;
      connectedKeepList(hostRef.current)
        .then((list) => {
          if (alive) keepListRef.current = list;
        })
        .catch(() => {})
        .finally(() => {
          keepRefreshing.current = false;
        });
    };
    refresh();
    const off = host.mcp?.onChanged?.(refresh);
    return () => {
      alive = false;
      off?.();
    };
  }, [host, hostRef]);

  return { keepListRef };
}
