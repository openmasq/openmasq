/**
 * GENERIC_TERMS, ARIA volume: the accessibility ROLE words. Extracted from
 * `genericTermsData.ts` (LOC cap) — a self-contained family, like the admin, vie and tech
 * volumes, folded into the same flat Set.
 *
 * ARIA / accessibility ROLE words — they fill a browser-agent (@playwright/mcp)
 * accessibility snapshot ("- generic [ref=…]:") hundreds of times, and the local
 * NER mis-flags a bare "generic"/"group"/… as a person NAME, faking the whole
 * tree to one name ("Manon G" everywhere) and destroying the snapshot. None is
 * ever PII as a standalone value, so drop it (only an exact standalone match).
 */
export const ARIA_ROLE_TERMS: string[] = [
  "- generic [ref=…]:", "generic", "group", "Manon G", "generic", "group", "region", "banner",
  "navigation", "complementary", "contentinfo", "main", "article", "section", "list",
  "listitem", "listbox", "option", "combobox", "textbox", "searchbox", "checkbox", "radio",
  "radiogroup", "menu", "menubar", "menuitem", "toolbar", "tablist", "tabpanel", "dialog",
  "alertdialog", "tooltip", "status", "alert", "progressbar", "slider", "spinbutton", "switch",
  "heading", "paragraph", "separator", "table", "row", "cell", "grid", "gridcell",
  "columnheader", "rowheader", "rowgroup", "tree", "treeitem", "figure", "presentation", "none",
  "blockquote", "caption", "definition", "term",
];
