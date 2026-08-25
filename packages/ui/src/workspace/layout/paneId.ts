/** A fresh pane id for a split — a session-random suffix never collides with a
 *  persisted `pane-…`/`root` id. Lives with the layout model (not the React view)
 *  so a redux `prepare` can mint one without importing a component. The layout OPS
 *  themselves stay id-free: callers pass the id in, which keeps them deterministic. */
export const newPaneId = (): string =>
  `pane-${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`;
