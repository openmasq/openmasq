/**
 * `<slug>_docx` — a branded Word document, and the format that was MISSING.
 *
 * PDF had `doc.image()` and PPTX had `<slug>_slide(image=…)`; Word had neither a helper nor
 * a line of guidance. Asked to "add an illustration" to a .docx, the model had no way to
 * place one and produced a HEADING announcing an illustration instead — a plausible answer
 * that does nothing, which is the worst failure shape. `<slug>_docx` closes that, and
 * `mcpAgentPython.test.ts` pins that every offered format documents its image path.
 *
 * `python-docx` is imported LAZILY, like the other two: a dev runtime baked without it fails
 * only the call that needs it.
 */
import { BRAND } from "@openmasq/branding";

const PY = BRAND.slug;

export const DOCX_HELPERS = `def ${PY}_docx(title="", subtitle=""):
    """DOCX à la charte ${BRAND.name}. Usage :
    doc = ${PY}_docx("Titre", "Sous-titre")
    doc.h1("Section"); doc.h2("Sous-section"); doc.p("Paragraphe.")
    doc.bullet("Puce"); doc.kv("Libellé", "Valeur"); doc.table(df)
    plt.savefig("chart.png"); doc.image("chart.png", caption="Évolution")
    doc.save("rapport.docx")"""
    import docx as _docx
    from docx.shared import Pt as _Pt, Inches as _In, RGBColor as _RGB
    from docx.enum.text import WD_ALIGN_PARAGRAPH as _AL

    _INK = _RGB(*_KV_RGB_INK); _MUTED = _RGB(*_KV_RGB_MUTED)
    _fontfile = _kv_font_file()
    # python-docx cannot EMBED a font file; it names a family and Word resolves it. The
    # bundled brand font is used when the machine has it, else a sane sans — never a
    # missing-glyph box.
    _FAMILY = "Space Grotesk" if _fontfile else "Calibri"

    class _KvDocx:
        def __init__(self):
            self.d = _docx.Document()
            _n = self.d.styles["Normal"]
            _n.font.name = _FAMILY; _n.font.size = _Pt(10.5); _n.font.color.rgb = _INK
            for _s in self.d.sections:
                _s.left_margin = _s.right_margin = _In(0.9)
            if title:
                _t = self.d.add_paragraph(); _r = _t.add_run(title)
                _r.font.size = _Pt(24); _r.font.bold = True; _r.font.color.rgb = _INK
            if subtitle:
                _st = self.d.add_paragraph(); _r = _st.add_run(subtitle)
                _r.font.size = _Pt(12); _r.font.color.rgb = _MUTED

        def h1(self, text):
            _p = self.d.add_paragraph(); _p.paragraph_format.space_before = _Pt(16)
            _r = _p.add_run(text); _r.font.size = _Pt(15); _r.font.bold = True; _r.font.color.rgb = _INK
            return self

        def h2(self, text):
            _p = self.d.add_paragraph(); _p.paragraph_format.space_before = _Pt(10)
            _r = _p.add_run(text); _r.font.size = _Pt(12); _r.font.bold = True; _r.font.color.rgb = _MUTED
            return self

        def p(self, text):
            self.d.add_paragraph(str(text)); return self

        def bullet(self, text):
            self.d.add_paragraph(str(text), style="List Bullet"); return self

        def kv(self, label, value):
            _p = self.d.add_paragraph()
            _r = _p.add_run(f"{label} : "); _r.font.bold = True; _r.font.color.rgb = _MUTED
            _p.add_run(str(value)); return self

        def table(self, data):
            _rows = _kv_rows(data)
            if not _rows:
                return self
            _t = self.d.add_table(rows=len(_rows), cols=len(_rows[0]))
            _t.style = "Light Grid Accent 1"
            for _i, _row in enumerate(_rows):
                for _j, _cell in enumerate(_row):
                    _c = _t.cell(_i, _j); _c.text = str(_cell)
                    for _par in _c.paragraphs:
                        for _run in _par.runs:
                            _run.font.size = _Pt(9.5)
                            if _i == 0:
                                _run.font.bold = True
            return self

        def image(self, path, w=6.2, caption=None):
            """Place une FIGURE (PNG issu de plt.savefig) dans le document."""
            self.d.add_picture(str(path), width=_In(w))
            self.d.paragraphs[-1].alignment = _AL.CENTER
            if caption:
                _p = self.d.add_paragraph(); _p.alignment = _AL.CENTER
                _r = _p.add_run(str(caption)); _r.font.size = _Pt(9); _r.font.italic = True
                _r.font.color.rgb = _MUTED
            return self

        def save(self, path="document.docx"):
            self.d.save(str(path)); return path

    return _KvDocx()
`;
