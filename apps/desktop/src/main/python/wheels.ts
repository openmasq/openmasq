/**
 * Pinned package set + the injected Python preamble for the sandboxed code runner.
 * Pure constants (no Node/Electron) so this file is trivially unit-testable.
 *
 * These WHEELS are installed into the runtime at BAKE time (`scripts/bake-python-runtime.ts`)
 * straight into the base CPython's site-packages (no venv), then BUNDLED into the app via
 * `electron-builder.cjs` `extraResources` — so a packaged build needs zero network on first
 * use and runs fully offline (see `runtime.ts` + `runtimeSpec.ts`). `pnpm dev` (no bundle)
 * falls back to a sha256-verified download. The pinned set is the single source `runtimeSpec`
 * hashes into the runtime signature. (The local BERT-NER model is bundled the same way.)
 */
import { DOC_HELPERS } from "./preamble";
import { FIGURE_SAVER } from "./preamble/figures";
import { BRAND } from "@openmasq/branding";

const PY = BRAND.slug;

/** The wheels installed into the venv on first use. Pinned for reproducibility;
 *  all ship cp312 binary wheels (no source builds → `--only-binary=:all:`). */
export const WHEELS: string[] = [
  "numpy==2.2.6",
  "pandas==2.2.3",
  "scipy==1.15.3",
  "matplotlib==3.10.3",
  "seaborn==0.13.2",
  "yfinance==0.2.65",
  "requests==2.32.3",
  // File generation — pure-Python wheels (work under `--only-binary=:all:`), so the
  // model can PRODUCE deliverables the sandbox captures + hands back to the user:
  "fpdf2==2.8.1", // PDF (import: `from fpdf import FPDF`)
  "openpyxl==3.1.5", // XLSX
  "python-docx==1.1.2", // DOCX (import: `import docx`)
  "python-pptx==1.0.2", // PPTX (import: `from pptx import Presentation`; pulls lxml+Pillow binary wheels)
];

/** Human-facing list of the pre-installed packages, for the model-facing guidance
 *  (so it uses what's there and never tries to `pip install`). */
export const PACKAGES = "numpy, pandas, scipy, matplotlib, seaborn (graphiques), yfinance, requests, fpdf2 (PDF), openpyxl (Excel), python-docx (Word), python-pptx (PowerPoint)";

/**
 * Hosts the egress proxy permits WHILE RUNNING model-generated code (suffix-matched).
 * yfinance/requests are forced through the loopback proxy (via `HTTPS_PROXY`), which
 * allow-lists ONLY these — so hallucinated/injected code can't reach anywhere else.
 * (Trusted install-time pip traffic is NOT proxied; this list is run-time only.)
 */
export const ALLOW_HOSTS: string[] = [
  // Market data + the crumb endpoint (v1/test/getcrumb).
  "query1.finance.yahoo.com",
  "query2.finance.yahoo.com",
  "finance.yahoo.com",
  // Cookie strategy "basic" — GET fc.yahoo.com for the A3 cookie.
  "fc.yahoo.com",
  // Cookie strategy "csrf" — yfinance FALLS BACK to this when the basic path fails
  // (fc.yahoo.com frequently 404s), hitting guce.yahoo.com/consent then
  // consent.yahoo.com/v2/collectConsent. Without these two the cookie+crumb handshake
  // never completes → the chart API 401s → "zéro donnée récupérée" for every ticker.
  // Still Yahoo-owned + still fail-closed (everything else 403s); scoped to the
  // sanctioned Yahoo Finance path.
  "guce.yahoo.com",
  "consent.yahoo.com",
];

/**
 * Injected before the user code. Sets the headless Agg backend and registers an
 * atexit hook that writes EVERY open matplotlib figure to `$OPENMASQ_FIG_DIR` — atexit
 * runs on normal exit AND after an unhandled exception (the interpreter runs atexit
 * during shutdown), so a figure created before a later error is still captured.
 * `# __USER_CODE__` is the injection point filled by {@link buildScript}.
 */
export const PREAMBLE = `import matplotlib
matplotlib.use("Agg")
import os as _os, atexit as _atexit
from cycler import cycler as _cycler
# ── brand theme (design system: forest ink + lime accent + highlight hues) ──
# Applied GLOBALLY (rcParams + seaborn + brand font) so EVERY plot is branded
# automatically — the model writes plain matplotlib/seaborn and the output already
# looks on-brand. Crisp too: readable size + HIGH export DPI for hi-dpi displays.
_KV_INK = "#18230d"    # forest ink — titles / text
_KV_MUTED = "#4c5c3b"  # muted forest — tick labels
_KV_GRID = "#ecebe4"   # subtle warm grid
_KV_SPINE = "#dcdad2"  # soft warm spine (lighter than ticks)
_KV_BG = "#fbfbfa"     # warm off-white surface
# Categorical cycle = the design highlight hues: lime, mint, violet, sky, amber, pink, ink.
_KV_CYCLE = ["#b8e635", "#5fe3c0", "#b79cff", "#6fc2ff", "#ffb85c", "#ff8fa3", "#18280c"]

# Brand font: register Space Grotesk (downloaded into the runtime) so plots use the
# charter typography. Best-effort — falls back to the default sans if it's absent.
_KV_FONT = "sans-serif"
try:
    _fd = _os.environ.get("OPENMASQ_FONT_DIR")
    if _fd and _os.path.isdir(_fd):
        from matplotlib import font_manager as _fm
        for _f in _os.listdir(_fd):
            if _f.lower().endswith((".ttf", ".otf")):
                _p = _os.path.join(_fd, _f)
                _fm.fontManager.addfont(_p)
                try:
                    _nm = _fm.FontProperties(fname=_p).get_name()
                    if _nm:
                        _KV_FONT = _nm
                except Exception:
                    pass
except Exception:
    pass

_KV_RC = {
    "figure.figsize": (8, 5), "figure.dpi": 110, "savefig.dpi": 200, "savefig.bbox": "tight",
    # constrained_layout evenly pads the figure + prevents titles/labels from clipping
    # (a very common ugliness) with no per-plot tight_layout() call from the model.
    "figure.constrained_layout.use": True,
    "font.family": _KV_FONT, "font.size": 11,
    "figure.titlesize": 15, "figure.titleweight": "bold",
    # Left-aligned, breathing-room title reads as an editorial chart header.
    "axes.titlesize": 14, "axes.titleweight": "bold", "axes.titlelocation": "left", "axes.titlepad": 14,
    "axes.labelsize": 11.5, "axes.labelweight": "medium", "axes.labelpad": 8,
    "figure.facecolor": _KV_BG, "axes.facecolor": _KV_BG, "savefig.facecolor": _KV_BG,
    "text.color": _KV_INK, "axes.labelcolor": _KV_INK, "axes.titlecolor": _KV_INK,
    # Soft spines, NO tick marks (labels only) + a little standoff → clean, modern axes.
    "axes.edgecolor": _KV_SPINE, "axes.linewidth": 1.0,
    "xtick.color": _KV_MUTED, "ytick.color": _KV_MUTED,
    "xtick.labelsize": 10.5, "ytick.labelsize": 10.5,
    "xtick.major.size": 0, "ytick.major.size": 0, "xtick.major.pad": 7, "ytick.major.pad": 7,
    "axes.grid": True, "axes.axisbelow": True, "grid.color": _KV_GRID, "grid.linewidth": 0.9,
    "axes.spines.top": False, "axes.spines.right": False,
    "axes.prop_cycle": _cycler(color=_KV_CYCLE),
    "lines.linewidth": 2.4, "lines.markersize": 6.5, "lines.solid_capstyle": "round",
    "patch.edgecolor": _KV_BG, "patch.linewidth": 0.6,
    # Sequential default (heatmaps / imshow / seaborn) tuned to the forest→lime brand ramp.
    "image.cmap": "YlGn",
    # Framed legend that sits ON the surface rather than a hard box on the plot.
    "legend.frameon": True, "legend.framealpha": 0.9, "legend.edgecolor": _KV_GRID,
    "legend.facecolor": _KV_BG, "legend.fontsize": 10.5, "legend.title_fontsize": 11,
    "legend.borderpad": 0.7,
}
matplotlib.rcParams.update(_KV_RC)

# seaborn imposes its OWN theme when the user calls set_theme/set_style, which would
# wipe the branding — so pre-seed seaborn with our palette+font, then RE-ASSERT _KV_RC
# so the app's theme wins the style regardless.
try:
    import seaborn as _sns
    _sns.set_theme(style="whitegrid", palette=_KV_CYCLE, font=_KV_FONT)
    matplotlib.rcParams.update(_KV_RC)
except Exception:
    pass

__OPENMASQ_FIG_DIR = _os.environ.get("OPENMASQ_FIG_DIR", ".")

${FIGURE_SAVER}

# yfinance keeps a SQLite tz/cookie cache and downloads multi-ticker in THREADS by
# default → concurrent cache writes raise "database is locked" (a fetch then fails
# mid-way, e.g. one ticker like BND). Force SEQUENTIAL downloads (fast enough for a
# handful of tickers) + a FRESH per-run cache dir so a stale lock can't strand a fetch —
# for the helper below AND any direct yf.download the model writes.
try:
    import yfinance as _yf0, tempfile as _tf0, re as _kv_re, datetime as _kv_dt
    try:
        _yf0.set_tz_cache_location(_tf0.mkdtemp(prefix="${PY}-yf-"))
    except Exception:
        pass
    # yfinance accepts ONLY these period strings; anything else (a common model
    # mistake like "2.5y" / "18mo") makes it silently return nothing ("No data
    # retrieved"). We convert a non-standard period into an explicit start date.
    _KV_PERIODS = {"1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y", "10y", "ytd", "max"}
    def _kv_period_days(p):
        _m = _kv_re.fullmatch("([0-9]*[.]?[0-9]+)(d|w|mo|y)", str(p).strip().lower())
        if not _m:
            return None
        return max(1, int(round(float(_m.group(1)) * {"d": 1, "w": 7, "mo": 30, "y": 365}[_m.group(2)])))
    _kv_orig_download = _yf0.download
    def _kv_download(*_a, **_k):
        _k.setdefault("threads", False)   # sequential → no SQLite "database is locked"
        _k.setdefault("progress", False)
        # yfinance 0.2.x defaults auto_adjust=True so the frame has NO "Adj Close"
        # column, and naive yf.download(...)["Adj Close"] then raises KeyError. Default
        # it OFF so BOTH "Close" and "Adj Close" exist (also silences the FutureWarning).
        _k.setdefault("auto_adjust", False)
        _p = _k.get("period")
        if _p and _p not in _KV_PERIODS and not _k.get("start"):
            _d = _kv_period_days(_p)
            if _d:
                _k.pop("period", None)
                _k["start"] = (_kv_dt.date.today() - _kv_dt.timedelta(days=_d)).isoformat()
        return _kv_orig_download(*_a, **_k)
    _yf0.download = _kv_download
except Exception:
    pass


_KV_ISIN_CACHE = {}
def _kv_ticker_for(token):
    """Resolve an ISIN (FR0011871110) to its Yahoo ticker (PUST.PA), else return the token
    unchanged. Cached; quiet on failure; prefers a Euronext Paris (.PA) listing. Lets the
    model pass the ISINs it reads off an article instead of GUESSING mnemonics ticker by
    ticker — the slow, ~14-round trial-and-error loop yfinance otherwise forces."""
    import re as _re, yfinance as _yf
    t = str(token).strip().upper()
    if not _re.fullmatch(r"[A-Z]{2}[A-Z0-9]{9}[0-9]", t):
        return t  # already a ticker (or not an ISIN) — leave as-is
    if t in _KV_ISIN_CACHE:
        return _KV_ISIN_CACHE[t]
    sym = t
    try:
        _q = getattr(_yf.Search(t, max_results=8), "quotes", None) or []
        _syms = [q.get("symbol") for q in _q if q.get("symbol")]
        _pa = [s for s in _syms if str(s).endswith(".PA")]
        sym = _pa[0] if _pa else (_syms[0] if _syms else t)
    except Exception:
        pass
    _KV_ISIN_CACHE[t] = sym
    return sym


def ${PY}_prices(tickers, period="2y", interval="1d"):
    """Cours de clôture (ajustés) → DataFrame propre : index de dates, UNE colonne par
    ticker. Accepte des ISIN (résolus automatiquement en ticker Yahoo) autant que des
    tickers. Normalise TOUTES les formes de retour de yfinance (mono- vs multi-ticker,
    colonnes MultiIndex, "Close"/"Adj Close") — évite les erreurs de forme du type
    'DataFrame' object has no attribute 'to_frame'. Lève une erreur claire si Yahoo ne
    renvoie rien. Usage : df = ${PY}_prices("SPY VOO QQQ", period="2y") — ou des ISIN :
    ${PY}_prices("FR0011871110 FR0011550185")."""
    import yfinance as _yf, pandas as _pd
    if isinstance(tickers, str):
        tickers = [t for t in tickers.replace(",", " ").split() if t]
    tickers = [str(t).strip().upper() for t in tickers if str(t).strip()]
    # Resolve any ISIN to its Yahoo ticker up front; keep a label map so the RETURNED
    # columns carry what the caller asked for (the ISIN), not the resolved mnemonic.
    resolved, relabel = [], {}
    for t in tickers:
        _sym = _kv_ticker_for(t)
        resolved.append(_sym)
        relabel[_sym] = t
    raw = _yf.download(resolved, period=period, interval=interval,
                       auto_adjust=True, progress=False, threads=False)
    if raw is None or getattr(raw, "empty", True):
        # yf.download SWALLOWS per-ticker failures (proxy 403, HTTP 429, bad symbol…):
        # it stashes the reason in yfinance.shared._ERRORS and returns an EMPTY frame.
        # Surface it IN the exception — the model's try/except prints the exception
        # message, and stderr is dropped on an exit-0 run, so this is the only channel
        # the true cause reliably rides.
        try:
            import yfinance.shared as _shared
            _errs = {str(k): str(v) for k, v in dict(getattr(_shared, "_ERRORS", {})).items()}
        except Exception:
            _errs = {}
        _detail = "; ".join(k + ": " + v for k, v in _errs.items())[:600]
        raise RuntimeError(
            "Yahoo Finance n'a renvoyé aucune donnée pour : " + ", ".join(tickers)
            + (" — cause : " + _detail if _detail else "")
        )
    if isinstance(raw.columns, _pd.MultiIndex):
        _lvl0 = list(raw.columns.get_level_values(0))
        close = raw["Close"] if "Close" in _lvl0 else raw.xs(_lvl0[0], axis=1, level=0)
    elif "Close" in raw.columns:
        close = raw[["Close"]]
        close.columns = [resolved[0] if resolved else "Close"]
    else:
        close = raw
    if isinstance(close, _pd.Series):
        close = close.to_frame(resolved[0] if resolved else "value")
    # Relabel the resolved tickers back to the caller's inputs (ISIN in → ISIN column).
    close = close.rename(columns=relabel)
    return close.dropna(how="all")

# __USER_CODE__
`;

/** Compose the full script: preamble (backend + atexit fallback), the branded
 *  document helpers (`preamble/` — `<slug>_pdf`/`<slug>_pptx`, lazy imports), then
 *  the user's code spliced at the injection point + an EXPLICIT figure-save at the
 *  end. User code runs at top level so a traceback surfaces normally on stderr. The
 *  trailing explicit save is the primary path — it runs while figures are still open
 *  and BEFORE matplotlib's own atexit (which, running LIFO, could clear figure
 *  state); the atexit registration remains only as a fallback for the exception path. */
export function buildScript(userCode: string): string {
  // Use a REPLACER FUNCTION, not a string (audit L16): a string 2nd arg interprets
  // `$&`/`$\``/`$'`/`$1` in the model/injected code as replacement patterns and mis-splices
  // the script. A function returns the code verbatim.
  return `${PREAMBLE.replace("# __USER_CODE__", () => `${DOC_HELPERS}\n${userCode}`)}\n__kv_save_figures()\n`;
}
