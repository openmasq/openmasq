import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

/**
 * THE side panel — the ONE home of everything that is not a conversation
 * (integrated browser, documents, generated artifacts). One rule, stated once:
 * non-chat content opens in the RIGHT HALF, et la conversation ne disparaît JAMAIS —
 * il n'existe plus aucun geste qui la masque (l'agrandissement du panneau a été retiré
 * avec son bouton : une capacité sans porte est du code mort, pas une réserve).
 *
 * The slice is SHARED across sections (chats + bibliothèque): open a file from the
 * library, come back to a conversation — the panel is still there, as left.
 * Session-only, never persisted (a restored file id may be stale; the browser is a
 * live child process).
 */

/** Structural copy of `containers/providers/artifact` `Artifact` — the state layer
 *  must not import from containers (tier rule); the shapes are kept identical. */
export interface PanelArtifact {
  id: string;
  kind: "csv" | "code";
  lang: string;
  title: string;
  text: string;
}

export type PanelItem =
  | { id: "browser"; kind: "browser" }
  | { id: string; kind: "file"; name: string; mime?: string; convId?: string }
  /** A file living in a folder the user granted to the Filesystem connector — opened
   *  from the Bibliothèque's « Dossiers » finder. It is NOT stored here: the panel holds
   *  its PATH and the viewer re-reads the bytes, so what you see is always what is on
   *  disk right now. */
  | { id: string; kind: "localfile"; path: string; name: string; mime?: string }
  | { id: string; kind: "artifact"; artifact: PanelArtifact };

export interface PanelState {
  /** Open items, in opening order — the RightRail's icon tabs (the one tab surface). */
  items: PanelItem[];
  activeId: string | null;
  /** The panel is on screen. Closing it KEEPS the items (the rail re-opens them). */
  open: boolean;
  /** Explicit user choice: the panel takes the full column (chat hidden). */

}

const initialState: PanelState = { items: [], activeId: null, open: false };

/** Activate (and reveal) an item, adding it if absent. */
function activate(state: PanelState, item: PanelItem) {
  if (!state.items.some((i) => i.id === item.id)) state.items.push(item);
  state.activeId = item.id;
  state.open = true;
}

const panelSlice = createSlice({
  name: "panel",
  initialState,
  reducers: {
    /** ONE browser item — reopening focuses it (the child keeps its own web tabs). */
    panelOpenBrowser(state) {
      activate(state, { id: "browser", kind: "browser" });
    },
    panelOpenFile(state, action: PayloadAction<{ id: string; name: string; mime?: string; convId?: string }>) {
      activate(state, { kind: "file", ...action.payload });
    },
    /** Keyed by PATH, so re-opening the same file focuses its tab instead of stacking
     *  duplicates — and a renamed file is correctly a different item. */
    panelOpenLocalFile(
      state,
      action: PayloadAction<{ path: string; name: string; mime?: string }>,
    ) {
      activate(state, { id: `localfile:${action.payload.path}`, kind: "localfile", ...action.payload });
    },
    panelOpenArtifact(state, action: PayloadAction<PanelArtifact>) {
      activate(state, { id: `artifact-${action.payload.id}`, kind: "artifact", artifact: action.payload });
    },
    panelSelect(state, action: PayloadAction<string>) {
      if (state.items.some((i) => i.id === action.payload)) {
        state.activeId = action.payload;
        state.open = true;
      }
    },
    /** Close ONE item (its ✕). The last one closing collapses the panel. */
    panelCloseItem(state, action: PayloadAction<string>) {
      state.items = state.items.filter((i) => i.id !== action.payload);
      if (state.activeId === action.payload) {
        state.activeId = state.items[state.items.length - 1]?.id ?? null;
      }
      if (state.items.length === 0) state.open = false;
    },
    /** Collapse the panel, KEEPING the items — le clic sur l'onglet ACTIF y mène. */
    panelHide(state) {
      state.open = false;
    },
  },
});

export const {
  panelOpenBrowser,
  panelOpenFile,
  panelOpenLocalFile,
  panelOpenArtifact,
  panelSelect,
  panelCloseItem,
  panelHide,
} = panelSlice.actions;
export const panelReducer = panelSlice.reducer;
