import { BRAND } from "@openmasq/branding";

/**
 * La capture AUTOMATIQUE des figures matplotlib — le pendant « graphique » des aides
 * document (`pdf.ts`/`docx.ts`/`pptx.ts`) : chaque figure ouverte est estampillée du
 * wordmark puis sauvée dans `OPENMASQ_FIG_DIR`, à l'atexit ET à l'appel explicite de fin
 * de script (`buildScript`). Splicé TEXTUELLEMENT dans le PREAMBLE de `../wheels.ts`,
 * dont il consomme les globaux (`_os`, `__OPENMASQ_FIG_DIR`, `_KV_*`).
 *
 * Le nom de fichier dérive du TITRE de la figure (suptitle, sinon le 1er axe) — c'est le
 * nom que l'utilisateur voit partout (bulle, Bibliothèque, Finder), et la consigne impose
 * déjà `set_title` au modèle ; `fig_N.png` nu finissait affiché tel quel. Le titre est du
 * texte écrit par le MODÈLE : ascii-fold + `[a-z0-9-]` seulement, jamais interpolé brut
 * dans un chemin (le double garde-fou côté main reste `readCollected`/`safeFileName`).
 * Collision dans le run → suffixe du numéro de figure, sinon le 1er savefig est écrasé
 * en silence. ⚠️ Python dans un template TS : jamais de `\${` ici.
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

// Le wordmark estampillé sur chaque figure dérive de la marque (règle 9). Remplacement
// textuel plutôt qu'interpolation : ce template s'interdit tout `\${` (voir l'en-tête).
export const FIGURE_SAVER = FIGURE_SAVER_RAW.replace("__KV_WORDMARK__", BRAND.slug);
