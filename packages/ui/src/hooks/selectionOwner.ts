/** The nearest Element for a selection boundary, which is a TEXT node most of the time. */
function elementOf(node: Node | null): Element | null {
  if (!node) return null;
  return node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
}

/**
 * Does a selection anchored at `node` belong to the surface tracking `host`?
 *
 * Containment alone is not enough: a MODAL renders inside the chat's own tree (ModalShell
 * doesn't portal), so a drag in the document preview satisfied `host.contains(node)` for
 * BOTH the modal's tracker and the chat's — one gesture opened two floating menus, the
 * modal's « Masquer » and the chat's « Masquer · Préciser · Retenir », the second
 * offering actions that mean nothing for a not-yet-sent file.
 *
 * So a modal panel between the selection and the host means the selection is the MODAL's.
 * A tracker whose own host lives inside that panel (the preview's document body) still
 * owns it — that is the `panel.contains(host)` branch.
 */
export function selectionBelongsTo(host: Element, node: Node | null): boolean {
  const el = elementOf(node);
  if (!el || !host.contains(node as Node)) return false;
  const panel = el.closest(".modal-panel");
  if (!panel) return true;
  return panel === host || panel.contains(host);
}

/**
 * Is this selection inside text the USER wrote or the model answered — as opposed to
 * text the APP is saying?
 *
 * A message list is not only messages. Between the bubbles sit the model name, the
 * turn's reasoning and tool trace, memory captions (« a retenu… »), quota
 * notices, error cards, the action row's own labels. Selecting any of it offered
 * « Masquer · Préciser · Retenir » — three actions that mean nothing there: you
 * cannot redact a caption the model never saw, nor remember a sentence the app just
 * wrote about itself.
 *
 * ALLOW-LIST, deliberately: the caller names what IS content (`[data-user-text]`, set
 * on the two containers that hold nothing else), and everything else is system text by
 * default. A deny-list of chrome classes would re-offer the menu on the next caption
 * anyone adds, silently — the failure being an ugly menu rather than a crash is
 * exactly why nobody would notice.
 *
 * A selection that STRADDLES content and chrome is rejected too: its common ancestor
 * sits above any single content node, so `closest` finds none. That is the wanted
 * answer — dragging from a reply through the next model's name is not a redaction.
 */
export function selectionIsUserText(node: Node | null, selector: string): boolean {
  const el = elementOf(node);
  return !!el?.closest(selector);
}
