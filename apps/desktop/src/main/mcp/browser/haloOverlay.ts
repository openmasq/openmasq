import { BrowserWindow, type Rectangle } from "electron";
import { DEVTOOLS_PREF } from "../../devtools";

// ── Drive-halo overlay window ────────────────────────────────────────────────
// The agent browser is a native `alwaysOnTop` window with NO DOM z-order, so a
// renderer element can never sit OVER it to draw the "the model is driving" halo.
// Instead we float a SECOND native window — transparent, click-THROUGH, at a HIGHER
// alwaysOnTop level — pinned EXACTLY over the browser's screen rect (same bounds, square
// corners, resizable so no platform clamps the tracking `setBounds`), painting the LOGIN
// PAGE's aurora masked to the edges. It reads as the login halo wrapped around the live
// page, without shrinking or obscuring it.
//
// SECURITY (rule 7): a MAIN-owned, purely DECORATIVE window. It loads a STATIC `data:`
// page — no remote content, no preload, no IPC surface (`window.openmasq` absent) — is
// non-focusable and forwards every pointer event to the browser beneath, so it adds ZERO
// interaction/attack surface. Being in MAIN it is NOT part of the agent child's CDP
// endpoint, so @playwright/mcp can never target it. Fail-safe: any platform that can't do
// a transparent/click-through overlay just gets no halo, never a crash.
//
// ⚠️ NOT verifiable headless (transparency, click-through, cross-window z-order are all
// native). Behaviour must be checked on real hardware — macOS especially.

let halo: BrowserWindow | null = null;

// THE LOGIN HALO, verbatim: the drive glow is the SAME aurora the auth scrim mounts behind
// the login card (`packages/ui/src/styles/auth/card.css` `.om-aurora`) — same two hues, same
// four radial plumes with the same color-mix strengths, same 16 s `om-aurora-kf` drift. Keep
// the two in lockstep: someone re-toning the login aurora is re-toning THIS.
//
// This static `data:` page cannot read the app's CSS tokens, so the `:root` values are
// PINNED here (rule 12 exception, same precedent as `writeConfirmHtml.ts`):
//   --hl-mint = #5fe3c0   --hl-sky = #6fc2ff
// The only addition vs the login: an EDGE MASK (union of four fading bands) — behind the
// login card the aurora may fill the screen, but over a live page it must hug the borders
// and leave the content readable. The window is pinned to the browser's exact screen rect,
// so the veil reads as the login halo wrapped around the page.
const HALO_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;height:100%;background:transparent;overflow:hidden}
  .h{position:fixed;inset:0;pointer-events:none;overflow:hidden;
    -webkit-mask:
      linear-gradient(to bottom,#000,transparent 110px),
      linear-gradient(to top,#000,transparent 110px),
      linear-gradient(to right,#000,transparent 110px),
      linear-gradient(to left,#000,transparent 110px);
    mask:
      linear-gradient(to bottom,#000,transparent 110px),
      linear-gradient(to top,#000,transparent 110px),
      linear-gradient(to right,#000,transparent 110px),
      linear-gradient(to left,#000,transparent 110px);
  }
  /* .om-aurora, copied — inset/opacity/blur/gradients/animation are the login values. */
  .h::before{
    content:"";position:absolute;inset:-20%;
    opacity:.85;filter:blur(46px);
    background:
      radial-gradient(38% 46% at 22% 30%, color-mix(in srgb,#5fe3c0 55%,transparent), transparent 70%),
      radial-gradient(42% 50% at 78% 24%, color-mix(in srgb,#6fc2ff 50%,transparent), transparent 72%),
      radial-gradient(46% 52% at 60% 82%, color-mix(in srgb,#5fe3c0 42%,transparent), transparent 74%),
      radial-gradient(40% 48% at 30% 78%, color-mix(in srgb,#6fc2ff 40%,transparent), transparent 72%);
    background-repeat:no-repeat;
    animation:om-aurora-kf 16s ease-in-out infinite;
  }
  @keyframes om-aurora-kf{
    0%{transform:translate3d(-3%,-2%,0) scale(1.05) rotate(0deg)}
    33%{transform:translate3d(3%,2%,0) scale(1.12) rotate(4deg)}
    66%{transform:translate3d(-2%,3%,0) scale(1.08) rotate(-3deg)}
    100%{transform:translate3d(-3%,-2%,0) scale(1.05) rotate(0deg)}
  }
  @media(prefers-reduced-motion:reduce){.h::before{animation:none}}
</style></head><body><div class="h" aria-hidden="true"></div></body></html>`;

function ensure(): BrowserWindow | null {
  if (halo && !halo.isDestroyed()) return halo;
  try {
    halo = new BrowserWindow({
      show: false,
      frame: false,
      transparent: true,
      hasShadow: false,
      // MUST track the browser rect EXACTLY. `resizable:true` because a non-resizable
      // window can clamp a programmatic `setBounds` resize (platform-dependent) — and the
      // user can never grab an edge anyway: frameless, non-focusable, click-through.
      resizable: true,
      // The browser window is square-cornered (`roundedCorners:false` in agentMain.ts);
      // the overlay must not clip its corners round over it.
      roundedCorners: false,
      movable: false,
      focusable: false, // never steal focus from the browser it decorates
      skipTaskbar: true,
      fullscreenable: false,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, ...DEVTOOLS_PREF },
    });
    halo.setAlwaysOnTop(true, "screen-saver"); // ABOVE the browser's 'floating' level
    halo.setIgnoreMouseEvents(true, { forward: true }); // click-through to the browser
    halo.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    void halo.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(HALO_HTML));
    halo.on("closed", () => {
      halo = null;
    });
    return halo;
  } catch {
    halo = null;
    return null;
  }
}

/** Show (or move) the halo over `bounds` (SCREEN coords — the same rect the browser uses).
 *  Shown INACTIVE so it never takes focus. */
export function showHaloAt(bounds: Rectangle): void {
  const w = ensure();
  if (!w) return;
  try {
    w.setBounds(bounds);
    if (!w.isVisible()) w.showInactive();
    w.setAlwaysOnTop(true, "screen-saver"); // re-assert (a shown window can drop its level)
  } catch {
    /* platform hiccup → skip this frame */
  }
}

export function hideHalo(): void {
  if (halo && !halo.isDestroyed() && halo.isVisible()) {
    try {
      halo.hide();
    } catch {
      /* noop */
    }
  }
}

export function destroyHalo(): void {
  if (halo && !halo.isDestroyed()) {
    try {
      halo.destroy();
    } catch {
      /* noop */
    }
  }
  halo = null;
}
