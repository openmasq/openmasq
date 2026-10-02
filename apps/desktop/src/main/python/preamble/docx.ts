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

    class _KvDocx:
        def __init__(self):
            self.d = _docx.Document()
            _kv_docx_fonts(self.d)
            _n = self.d.styles["Normal"]
            _n.font.name = _KV_OFFICE_FONT; _n.font.size = _Pt(10.5); _n.font.color.rgb = _INK
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
                            _run.font.size = _Pt(9.5); _run.font.name = _KV_OFFICE_FONT
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


def _kv_docx_fonts(d):
    """python-docx cannot EMBED a font: it names a family the reader's Word resolves. Aptos
    becomes the document default on all four script slots (replacing the template's theme
    fonts), and the font table names Calibri as its substitute (w:altName) for an Office
    before 2023 or LibreOffice — never a serif default nor a missing-glyph box."""
    from docx.oxml.ns import qn as _qn
    try:
        _rf = d.styles.element.find(_qn("w:docDefaults")).find(_qn("w:rPrDefault")).find(_qn("w:rPr")).find(_qn("w:rFonts"))
        for _k in list(_rf.attrib):
            del _rf.attrib[_k]
        for _a in ("ascii", "hAnsi", "eastAsia", "cs"):
            _rf.set(_qn("w:" + _a), _KV_OFFICE_FONT)
    except Exception:
        pass
    try:
        _decl = ('<w:font w:name="%s"><w:altName w:val="%s"/><w:panose1 w:val="%s"/><w:charset w:val="00"/>'
                 '<w:family w:val="swiss"/><w:pitch w:val="variable"/></w:font>'
                 % (_KV_OFFICE_FONT, _KV_OFFICE_FONT_ALT, _KV_OFFICE_PANOSE)).encode()
        for _rel in d.part.rels.values():
            if _rel.reltype.endswith("/fontTable") and _decl not in _rel.target_part.blob:
                _rel.target_part._blob = _rel.target_part.blob.replace(b"</w:fonts>", _decl + b"</w:fonts>")
    except Exception:
        pass
`;
