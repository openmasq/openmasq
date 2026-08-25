/**
 * `<slug>_pdf` — a branded PDF from a tiny API, so even a weak model ships something
 * polished instead of hand-rolling fpdf layout.
 *
 * ⚠️ `doc.image()` SHADOWS `FPDF.image`: it must call `FPDF.image(self, …)` or it recurses,
 * and it page-breaks itself so fpdf2 never splits an image from its caption.
 */
import { BRAND } from "@openmasq/branding";

const PY = BRAND.slug;

export const PDF_HELPERS = `def ${PY}_pdf(title="", subtitle=""):
    """PDF à la charte ${BRAND.name}. Usage :
    doc = ${PY}_pdf("Titre", "Sous-titre")
    doc.h1("Section"); doc.h2("Sous-section"); doc.p("Paragraphe.")
    doc.bullet("Puce"); doc.kv("Libellé", "Valeur"); doc.table(df)
    plt.savefig("chart.png"); doc.image("chart.png", caption="Évolution")
    doc.save("rapport.pdf")"""
    from fpdf import FPDF
    from fpdf.fonts import FontFace

    class _KvPDF(FPDF):
        def header(self):
            if self.page_no() == 1:
                return
            self.set_font(self._kv_family, "", 8.5); self.set_text_color(*_KV_RGB_MUTED)
            self.cell(0, 6, self._kv_title[:90], align="L", new_x="LMARGIN", new_y="NEXT")
            self.set_draw_color(*_KV_RGB_LIME); self.set_line_width(0.7)
            self.line(self.l_margin, 15, self.w - self.r_margin, 15)
            self.set_y(21)
        def footer(self):
            self.set_y(-14)
            self.set_font(self._kv_family, "", 8); self.set_text_color(*_KV_RGB_MUTED)
            self.cell(0, 8, f"${PY} · page {self.page_no()}/{{nb}}", align="R")
        def _ink(self):
            self.set_text_color(*_KV_RGB_INK)
        def h1(self, txt):
            self.ln(4); self.set_font(self._kv_family, "B", 17); self._ink()
            self.set_fill_color(*_KV_RGB_LIME)
            self.cell(2.2, 9, "", fill=True); self.cell(3, 9, "")
            self.multi_cell(0, 9, str(txt), new_x="LMARGIN", new_y="NEXT"); self.ln(1.5)
        def h2(self, txt):
            self.ln(2); self.set_font(self._kv_family, "B", 13); self._ink()
            self.multi_cell(0, 7, str(txt), new_x="LMARGIN", new_y="NEXT"); self.ln(1)
        def p(self, txt):
            self.set_font(self._kv_family, "", 10.5); self._ink()
            self.multi_cell(0, 5.6, str(txt), new_x="LMARGIN", new_y="NEXT"); self.ln(1.5)
        def bullet(self, txt):
            self.set_font(self._kv_family, "", 10.5); self._ink()
            # ASCII on purpose: the helvetica fallback (no brand font) is latin-1-only.
            self.cell(5, 5.6, "-")
            self.multi_cell(0, 5.6, str(txt), new_x="LMARGIN", new_y="NEXT"); self.ln(0.6)
        def kv(self, label, value):
            self.set_font(self._kv_family, "", 10.5); self.set_text_color(*_KV_RGB_MUTED)
            self.cell(52, 6, str(label))
            self.set_font(self._kv_family, "B", 10.5); self._ink()
            self.multi_cell(0, 6, str(value), new_x="LMARGIN", new_y="NEXT")
        def space(self, h=4):
            self.ln(h)
        def image(self, path, w=0, caption=None):
            """Insère une IMAGE — typiquement un graphique enregistré par
            plt.savefig("chart.png"). w = largeur en mm (défaut : toute la colonne).
            Centrée, légende optionnelle sous l'image."""
            _avail = self.w - self.l_margin - self.r_margin
            _w = min(float(w), _avail) if w else _avail
            _h = 0.0
            try:
                # Pillow (déjà présent via python-pptx) donne le ratio, donc la hauteur.
                from PIL import Image as _Im
                _iw, _ih = _Im.open(str(path)).size
                _h = _w * (_ih / float(_iw))
            except Exception:
                pass
            # Page suivante AVANT de dessiner si l'image (et sa légende) ne tient pas —
            # et seulement si elle tiendrait sur une page vierge, sinon fpdf2 gère seul
            # (deux sauts = une page blanche).
            _room = self.h - self.b_margin - self.get_y()
            _need = _h + (7 if caption else 0)
            if _h and _need > _room and _h < self.h - self.b_margin - self.t_margin:
                self.add_page()
            # FPDF.image explicitement : cette méthode PORTE le même nom (comme table).
            FPDF.image(self, str(path), x=(self.w - _w) / 2, w=_w)
            if caption:
                self.ln(1.5)
                self.set_font(self._kv_family, "", 9); self.set_text_color(*_KV_RGB_MUTED)
                self.multi_cell(0, 4.6, str(caption), new_x="LMARGIN", new_y="NEXT", align="C")
                self._ink()
            self.ln(3)
        def table(self, data=None, **kw):
            if data is None:
                return FPDF.table(self, **kw)
            self.set_font(self._kv_family, "", 9.5); self._ink()
            self.set_draw_color(*_KV_RGB_GRID); self.set_line_width(0.25)
            # Reset the AMBIENT fill (h1's lime accent leaks into the even rows otherwise).
            self.set_fill_color(*_KV_RGB_BG)
            with FPDF.table(
                self,
                headings_style=FontFace(emphasis="BOLD", color=_KV_RGB_INK, fill_color=_KV_RGB_LIME),
                cell_fill_color=_KV_RGB_STRIPE, cell_fill_mode="ROWS",
                borders_layout="HORIZONTAL_LINES", line_height=6.2, padding=1.6,
            ) as _tb:
                for _r in _kv_rows(data):
                    _row = _tb.row()
                    for _c in _r:
                        _row.cell(str(_c))
            self.ln(2)
        def save(self, name):
            self.output(str(name))
            print(f"[fichier généré] {name}")

    doc = _KvPDF(format="A4")
    doc._kv_family = "helvetica"
    _fp = _kv_font_file()
    if _fp:
        try:
            doc.add_font("${BRAND.name}", "", _fp); doc.add_font("${BRAND.name}", "B", _fp)
            doc._kv_family = "${BRAND.name}"
        except Exception:
            pass
    doc._kv_title = str(title)
    doc.alias_nb_pages()
    doc.set_auto_page_break(True, margin=18)
    doc.set_margins(16, 16, 16)
    doc.add_page()
    if title:
        doc.set_font(doc._kv_family, "B", 24); doc.set_text_color(*_KV_RGB_INK)
        doc.multi_cell(0, 11, str(title), new_x="LMARGIN", new_y="NEXT")
        doc.set_draw_color(*_KV_RGB_LIME); doc.set_line_width(1.2)
        doc.line(doc.l_margin, doc.get_y() + 2, doc.l_margin + 42, doc.get_y() + 2)
        doc.ln(6)
        if subtitle:
            doc.set_font(doc._kv_family, "", 12); doc.set_text_color(*_KV_RGB_MUTED)
            doc.multi_cell(0, 6.5, str(subtitle), new_x="LMARGIN", new_y="NEXT")
        import datetime as _dt
        doc.set_font(doc._kv_family, "", 9); doc.set_text_color(*_KV_RGB_MUTED)
        doc.cell(0, 6, _dt.date.today().strftime("%d/%m/%Y"), new_x="LMARGIN", new_y="NEXT")
        doc.ln(4)
    return doc


def _kv_text(s, txt, x, y, w, h, size=18, bold=False, color=_KV_RGB_INK, align="l"):
    from pptx.util import Inches, Pt
    from pptx.dml.color import RGBColor
    from pptx.enum.text import PP_ALIGN
    tb = s.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = tb.text_frame; tf.word_wrap = True
    lines = list(txt) if isinstance(txt, (list, tuple)) else [txt]
    for i, line in enumerate(lines):
        para = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        para.text = str(line)
        para.alignment = PP_ALIGN.RIGHT if align == "r" else PP_ALIGN.LEFT
        if i > 0:
            para.space_before = Pt(6)
        for run in para.runs:
            run.font.size = Pt(size); run.font.bold = bold
            run.font.name = "Space Grotesk"
            run.font.color.rgb = RGBColor(*color)
    return tb


def _kv_rect(s, x, y, w, h, color=_KV_RGB_LIME):
    from pptx.util import Inches
    from pptx.dml.color import RGBColor
    from pptx.enum.shapes import MSO_SHAPE
    r = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(x), Inches(y), Inches(w), Inches(h))
    r.fill.solid(); r.fill.fore_color.rgb = RGBColor(*color); r.line.fill.background()
    return r


def _kv_blank(prs):
    from pptx.dml.color import RGBColor
    s = prs.slides.add_slide(prs.slide_layouts[6])
    s.background.fill.solid()
    s.background.fill.fore_color.rgb = RGBColor(*_KV_RGB_BG)
    _kv_text(s, "${PY}", 12.1, 7.05, 1.05, 0.35, size=10, bold=True, color=_KV_RGB_MUTED, align="r")
    return s
`;
