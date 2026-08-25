/**
 * The charter every branded document helper shares: the palette, the bundled brand font,
 * and `_kv_rows` (DataFrame/list → rows of strings). Its own module so `pdf.ts`, `pptx.ts`
 * and `docx.ts` cannot drift into three slightly different renderings of the same table.
 */
export const DOC_SHARED = `_KV_RGB_INK = (24, 35, 13); _KV_RGB_MUTED = (76, 92, 59); _KV_RGB_LIME = (184, 230, 53)
_KV_RGB_BG = (251, 251, 250); _KV_RGB_GRID = (220, 218, 210); _KV_RGB_STRIPE = (245, 245, 241)


def _kv_font_file():
    _fd = _os.environ.get("OPENMASQ_FONT_DIR")
    if _fd and _os.path.isdir(_fd):
        for _f in sorted(_os.listdir(_fd)):
            if _f.lower().endswith((".ttf", ".otf")):
                return _os.path.join(_fd, _f)
    return None


def _kv_rows(data):
    """DataFrame / liste de lignes -> lignes de str (la 1re = les en-têtes)."""
    try:
        import pandas as _pd
        if isinstance(data, _pd.Series):
            data = data.to_frame()
        if isinstance(data, _pd.DataFrame):
            _d = data if isinstance(data.index, _pd.RangeIndex) else data.reset_index()
            def _fmt(v):
                if v is None or (isinstance(v, float) and v != v):
                    return ""
                if isinstance(v, float):
                    return f"{v:,.2f}".replace(",", " ")
                return str(v)
            return [[str(c) for c in _d.columns]] + [[_fmt(v) for v in r] for r in _d.itertuples(index=False)]
    except Exception:
        pass
    return [[str(c) for c in r] for r in data]
`;
