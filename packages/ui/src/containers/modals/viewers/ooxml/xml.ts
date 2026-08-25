// Namespace-aware XML helpers for the OOXML parsers (docx + pptx). Browser-only
// (`DOMParser`); the viewers run in the renderer, and the tests opt into jsdom.
//
// Lookups are by NAMESPACE, never by literal prefix: `w:`/`a:`/`p:` are only a
// CONVENTION, and a producer is free to bind the same namespace to another prefix
// (or to make it the default). A `getElementsByTagName("w:b")` walk silently finds
// NOTHING on such a file — the document renders unstyled with no error, which is
// exactly the kind of quiet degradation this viewer must not have.

/** WordprocessingML — docx body, runs, run properties. */
export const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
/** DrawingML — shared by both: theme, colours, shape geometry, pptx text runs. */
export const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
/** PresentationML — pptx slides, shape tree, placeholders. */
export const P = "http://schemas.openxmlformats.org/presentationml/2006/main";
/** Relationship references INSIDE a part (`r:embed`, `r:id`). */
export const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
/** The `.rels` part format itself — a DIFFERENT namespace from `R` above. */
export const REL = "http://schemas.openxmlformats.org/package/2006/relationships";

/**
 * Parse an OOXML part. Throws on malformed XML rather than returning a partial
 * tree: a `<parsererror>` document would otherwise walk as "no elements found"
 * and render an empty, styleless document as if the file were simply plain.
 */
export function parseXml(text: string): Document {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("malformed OOXML part");
  return doc;
}

/** Direct children named `{ns}name` (NOT descendants — `getElementsByTagNameNS` would
 *  reach into nested shapes/paragraphs and steal a grandchild's properties). */
export function children(el: Element | null | undefined, ns: string, name: string): Element[] {
  if (!el) return [];
  const out: Element[] = [];
  for (const node of el.children)
    if (node.namespaceURI === ns && node.localName === name) out.push(node);
  return out;
}

/** First direct child named `{ns}name`. */
export function child(el: Element | null | undefined, ns: string, name: string): Element | null {
  return children(el, ns, name)[0] ?? null;
}

/** Follow a chain of direct children (`path(sp, A, "spPr", "xfrm", "off")`). */
export function path(el: Element | null | undefined, ns: string, ...names: string[]): Element | null {
  let cur: Element | null = el ?? null;
  for (const n of names) cur = child(cur, ns, n);
  return cur;
}

/** An attribute by namespace + local name. OOXML attributes are prefixed
 *  (`w:val`, `r:embed`) — an unprefixed `getAttribute("val")` misses them. */
export function attrNS(el: Element | null | undefined, ns: string, name: string): string | undefined {
  return el?.getAttributeNS(ns, name) ?? undefined;
}

/** An UNPREFIXED attribute (`<a:off x="…">`, `<Relationship Id="…">`). */
export function attr(el: Element | null | undefined, name: string): string | undefined {
  return el?.getAttribute(name) ?? undefined;
}

/**
 * OOXML's on/off toggle semantics. `<w:b/>` and `<w:b w:val="1"/>` are ON;
 * `<w:b w:val="0"/>` is OFF — and OFF is MEANINGFUL, not absence: it overrides an
 * inherited `true` from a named style or docDefaults. So this returns `undefined`
 * for a missing element (inherit) and `false` for an explicit off (override).
 */
export function onOff(el: Element | null | undefined, ns: string): boolean | undefined {
  if (!el) return undefined;
  const v = attrNS(el, ns, "val");
  if (v === undefined) return true; // bare <w:b/>
  return v !== "0" && v !== "false" && v !== "off";
}

/** A numeric attribute, or `undefined` when absent/unparseable. */
export function num(v: string | undefined): number | undefined {
  if (v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
