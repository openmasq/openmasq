import { BRAND } from "@openmasq/branding";

/**
 * The AUTOMATIC capture of matplotlib figures — the "graphics" counterpart of the
 * document helpers (`pdf.ts`/`docx.ts`/`pptx.ts`): every open figure is stamped with the
 * wordmark then saved into `OPENMASQ_FIG_DIR`, at atexit AND at the script's explicit
 * end call (`buildScript`). Spliced TEXTUALLY into the PREAMBLE of `../wheels.ts`,
 * whose globals it consumes (`_os`, `__OPENMASQ_FIG_DIR`, `_KV_*`).
 *
 * The file name derives from the figure's TITLE (suptitle, else the 1st axis) — it's the
 * name the user sees everywhere (bubble, Library, Finder), and the instructions already
 * require `set_title` of the model; a bare `fig_N.png` used to end up displayed as-is. The title is
 * text written by the MODEL: ascii-fold + `[a-z0-9-]` only, never interpolated raw
 * into a path (the double guardrail on the main side remains `readCollected`/`safeFileName`).
 * Collision within the run → suffixed with the figure number, otherwise the 1st savefig is
 * silently overwritten. ⚠️ Python inside a TS template: never any `\${` here.
 */
const FIGURE_SAVER_RAW = `
def __kv_fig_name(_fig, _n, _used):
    try:
        import unicodedata as _ud
        import re as _re
        _t = ""
        try:
            if _fig._suptitle is not None:
                _t = _fig._suptitle.get_text()
        except Exception:
            pass
        if not _t and _fig.axes:
            _t = _fig.axes[0].get_title()
        _t = _ud.normalize("NFKD", _t or "").encode("ascii", "ignore").decode()
        _t = _re.sub(r"[^A-Za-z0-9]+", "-", _t).strip("-").lower()[:60]
    except Exception:
        _t = ""
    _base = _t or f"graphique-{_n}"
    if _base in _used:
        _base = f"{_base}-{_n}"
    _used.add(_base)
    return _base + ".png"


def __kv_save_figures():
    try:
        import matplotlib.pyplot as _plt
        _used = set()
        for _n in _plt.get_fignums():
            _fig = _plt.figure(_n)
            # Subtle brand wordmark, bottom-right — automatic branding on every plot.
            _fig.text(0.995, 0.008, "__KV_WORDMARK__", ha="right", va="bottom",
                      fontsize=8, color=_KV_INK, alpha=0.32, fontweight="bold", family=_KV_FONT)
            _fig.savefig(
                _os.path.join(__OPENMASQ_FIG_DIR, __kv_fig_name(_fig, _n, _used)),
                dpi=200, bbox_inches="tight", facecolor=_KV_BG,
            )
    except Exception:
        pass


_atexit.register(__kv_save_figures)
`;

// The wordmark stamped on every figure derives from the brand (rule 9). Textual
// replacement rather than interpolation: this template forbids any `\${` (see the header).
export const FIGURE_SAVER = FIGURE_SAVER_RAW.replace("__KV_WORDMARK__", BRAND.slug);
