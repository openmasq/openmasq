/**
 * `<slug>_pptx` + `<slug>_slide` — a branded deck. `python-pptx` is imported LAZILY so a dev
 * runtime baked without it fails only the call that needs it, never the whole run.
 */
import { BRAND } from "@openmasq/branding";

const PY = BRAND.slug;

export const PPTX_HELPERS = `def ${PY}_pptx(title=None, subtitle=None):
    """Présentation PowerPoint 16:9 à la charte ${BRAND.name}. Usage :
    prs = ${PY}_pptx("Titre", "Sous-titre")
    ${PY}_slide(prs, "Points clés", bullets=["a", "b"])
    ${PY}_slide(prs, "Chiffres", table=df)
    ${PY}_slide(prs, "Graphique", image="chart.png")  # PNG issu de plt.savefig
    prs.save("presentation.pptx")"""
    from pptx import Presentation
    from pptx.util import Inches
    prs = Presentation()
    prs.slide_width = Inches(13.333); prs.slide_height = Inches(7.5)
    if title:
        s = _kv_blank(prs)
        _kv_text(s, title, 0.9, 2.5, 11.5, 1.7, size=44, bold=True)
        _kv_rect(s, 0.92, 4.2, 1.6, 0.09)
        if subtitle:
            _kv_text(s, subtitle, 0.9, 4.45, 11.5, 0.9, size=20, color=_KV_RGB_MUTED)
        import datetime as _dt
        _kv_text(s, _dt.date.today().strftime("%d/%m/%Y"), 0.9, 6.6, 5, 0.4, size=12, color=_KV_RGB_MUTED)
    return prs


def _kv_image(s, path, x, y, w, h):
    from pptx.util import Inches
    try:
        from PIL import Image as _Im
        _iw, _ih = _Im.open(path).size
        _ar = _iw / float(_ih)
        _w, _h = (h * _ar, h) if (w / h) > _ar else (w, w / _ar)
        s.shapes.add_picture(str(path), Inches(x + (w - _w) / 2), Inches(y + (h - _h) / 2), Inches(_w), Inches(_h))
    except Exception:
        s.shapes.add_picture(str(path), Inches(x), Inches(y), width=Inches(w))


def _kv_table(s, data, x, y, w, h):
    from pptx.util import Inches, Pt
    from pptx.dml.color import RGBColor
    rows = _kv_rows(data)
    if len(rows) > 16:
        print(f"[${PY}_slide] tableau tronqué à 15 lignes (sur {len(rows) - 1}) pour rester lisible")
        rows = rows[:16]
    ncol = max(len(r) for r in rows)
    tb = s.shapes.add_table(len(rows), ncol, Inches(x), Inches(y), Inches(w), Inches(min(h, 0.42 * len(rows)))).table
    for _i, _r in enumerate(rows):
        for _j in range(ncol):
            c = tb.cell(_i, _j)
            c.text = str(_r[_j]) if _j < len(_r) else ""
            c.fill.solid()
            c.fill.fore_color.rgb = RGBColor(*(_KV_RGB_LIME if _i == 0 else (_KV_RGB_STRIPE if _i % 2 == 0 else _KV_RGB_BG)))
            for p in c.text_frame.paragraphs:
                for r in p.runs:
                    r.font.size = Pt(12); r.font.name = "Space Grotesk"
                    r.font.bold = _i == 0
                    r.font.color.rgb = RGBColor(*_KV_RGB_INK)


def ${PY}_slide(prs, title, bullets=None, table=None, image=None, text=None):
    """Ajoute une diapo à la charte : bullets=liste de puces, table=DataFrame/lignes,
    image=chemin d'un PNG (plt.savefig), text=paragraphe. bullets+image = côte à côte."""
    s = _kv_blank(prs)
    if title:
        _kv_text(s, title, 0.7, 0.45, 12, 0.9, size=28, bold=True)
        _kv_rect(s, 0.72, 1.26, 1.1, 0.07)
    top, left, width, height = 1.7, 0.7, 12.0, 5.1
    if bullets and image:
        width = 5.9
    if bullets:
        _kv_text(s, ["•  " + str(b) for b in bullets], left, top, width, height, size=17)
    if text:
        _kv_text(s, text, left, top, width, height, size=16)
    if image:
        _kv_image(s, image, 7.0 if bullets else left, top, 5.7 if bullets else width, height)
    if table is not None:
        _kv_table(s, table, left, top, width, height)
    return s
`;
