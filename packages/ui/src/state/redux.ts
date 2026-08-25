import {
  configureStore,
  createSlice,
  current,
  type PayloadAction,
} from "@reduxjs/toolkit";
import {
  useDispatch,
  useSelector,
  type TypedUseSelectorHook,
} from "react-redux";
import { type TrackEvent } from "../analytics";
import type { Section } from "../types";
import { settingsCacheReducer } from "./settingsCache";
import {
  allOpenConvIds,
  chatRef,
  focusPane as layoutFocusPane,
  moveTab as layoutMoveTab,
  openTab as layoutOpenTab,
  pruneLayout,
  pruneFileRefs,
  removeConversation as layoutRemoveConversation,
  resizeSplit as layoutResizeSplit,
  serializeLayout,
  setActiveTab as layoutSetActiveTab,
  showWelcome as layoutShowWelcome,
  splitWithTab as layoutSplitWithTab,
  type WorkspaceLayout,
} from "../workspace/layout";
import { devLogger, isDevMode } from "./devlog";
import { SECTION_KEY, TABS_KEY, WORKSPACE_KEY, initialLayout, readInitialSection } from "./reduxBoot";
import { panelReducer } from "./panel";

export {
  panelOpenBrowser,
  panelOpenFile,
  panelOpenLocalFile,
  panelOpenArtifact,
  panelSelect,
  panelCloseItem,
  panelHide,
  type PanelItem,
  type PanelArtifact,
} from "./panel";

export { isDevMode } from "./devlog";

// One-time visible breadcrumb so you can confirm the dev logger is wired up.
// (Shown in the RENDERER DevTools console — open the Electron window's DevTools,
// not the terminal that runs `pnpm dev`.)
try {
  // eslint-disable-next-line no-console
  console.log(
    `[openmasq] redux dev logger ${isDevMode ? "ON" : "off"} (${
      typeof window !== "undefined" ? window.location?.protocol : "no-window"
    })`,
  );
} catch {
  /* ignore */
}

// Defined in ../types (type-only, so analytics/events.ts can share it without a
// runtime cycle) and re-exported here — `state/redux`'s Section importers are
// unchanged, and `SECTIONS` below stays its runtime counterpart.
export type { Section };

interface UiState {
  section: Section;
  /** The tiling workspace layout — CONVERSATIONS ONLY (a recursive split tree of
   *  panes). Everything non-chat lives in the `panel` slice. */
  layout: WorkspaceLayout;
  /** DERIVED (maintained by every layout reducer) = every open conversation id. */
  openTabIds: string[];
  /** The MÉMOIRE gained something the user hasn't seen (background extraction / a
   *  « Retenir » gesture) — the rail's dot. Session-only; cleared on visiting the
   *  Mémoire section. */
  memoryFresh: boolean;
}

const uiSlice = createSlice({
  name: "ui",
  initialState: (() => {
    // `file:` refs are legacy (non-chat content lives in the PANEL slice now) — a
    // persisted one from an older build is stripped at boot.
    const layout = pruneFileRefs(initialLayout());
    return {
      section: readInitialSection(),
      layout,
      openTabIds: allOpenConvIds(layout),
      memoryFresh: false,
    } as UiState;
  })(),
  reducers: {
    setSection(state, action: PayloadAction<Section>) {
      state.section = action.payload;
    },
    /** Raise / clear the Mémoire « nouveau » dot (see `UiState.memoryFresh`). */
    setMemoryFresh(state, action: PayloadAction<boolean>) {
      state.memoryFresh = action.payload;
    },
    /** Open a conversation in the focused pane (idempotent — if already open
     *  anywhere, focuses that pane's tab instead of duplicating). */
    openTab(state, action: PayloadAction<string>) {
      const l = layoutOpenTab(current(state).layout, chatRef(action.payload));
      state.layout = l;
      state.openTabIds = allOpenConvIds(l);
    },
    /** Close a conversation's tab wherever it lives (collapses an emptied pane). */
    closeTab(state, action: PayloadAction<string>) {
      const l = layoutRemoveConversation(current(state).layout, chatRef(action.payload));
      state.layout = l;
      state.openTabIds = allOpenConvIds(l);
    },
    /** Prune the layout to the given live conversation ids (a conversation was
     *  deleted / not loaded). Name kept for back-compat with existing callers. */
    setOpenTabs(state, action: PayloadAction<string[]>) {
      const l = pruneLayout(current(state).layout, new Set(action.payload));
      state.layout = l;
      state.openTabIds = allOpenConvIds(l);
    },
    /** Make a conversation the active tab of its pane + focus that pane. */
    setActiveTab(state, action: PayloadAction<{ paneId: string; convId: string }>) {
      const l = layoutSetActiveTab(current(state).layout, action.payload.paneId, chatRef(action.payload.convId));
      state.layout = l;
      state.openTabIds = allOpenConvIds(l);
    },
    /** Focus a pane (its active tab becomes the workspace's active conversation). */
    focusPane(state, action: PayloadAction<string>) {
      state.layout = layoutFocusPane(current(state).layout, action.payload);
    },
    /** « Nouvelle conversation » : montrer l'ACCUEIL dans le pane focalisé — aucune
     *  conversation n'est créée (elle naîtra au premier envoi, dans le `onSend` du
     *  pane). Les onglets du pane restent, aucun n'est actif. */
    showWelcomePane(state) {
      state.layout = layoutShowWelcome(current(state).layout);
    },
    /** Move a conversation into another pane (drag between panes / reorder). */
    moveTab(state, action: PayloadAction<{ convId: string; toPane: string; toIndex?: number }>) {
      const l = layoutMoveTab(current(state).layout, { ...action.payload, convId: chatRef(action.payload.convId) });
      state.layout = l;
      state.openTabIds = allOpenConvIds(l);
    },
    /** Split a pane and drop a conversation into the new pane (drag-to-edge / diviser). */
    splitWithTab(
      state,
      action: PayloadAction<{
        targetPane: string;
        convId: string;
        direction: "row" | "column";
        position: "before" | "after";
        newPaneId: string;
      }>,
    ) {
      const l = layoutSplitWithTab(current(state).layout, { ...action.payload, convId: chatRef(action.payload.convId) });
      state.layout = l;
      state.openTabIds = allOpenConvIds(l);
    },
    /** Resize a split (gutter drag). */
    resizeSplit(state, action: PayloadAction<{ splitId: string; sizes: number[] }>) {
      state.layout = layoutResizeSplit(current(state).layout, action.payload.splitId, action.payload.sizes);
    },
    /** Replace the whole layout (boot restore / reset). */
    setLayout(state, action: PayloadAction<WorkspaceLayout>) {
      state.layout = action.payload;
      state.openTabIds = allOpenConvIds(action.payload);
    },
    /**
     * Telemetry-only action — doesn't change state. Surfaces a typed event in the
     * dev console + Redux DevTools, and (via the middleware) hands it to the
     * privacy-safe analytics pipeline. Only events from the `TrackEvent` union are
     * accepted, so no free-form/content payload can be attached.
     */
    track: {
      reducer() {},
      prepare(event: TrackEvent) {
        return { payload: event };
      },
    },
  },
});

export const {
  setSection,
  setMemoryFresh,
  openTab,
  closeTab,
  setOpenTabs,
  setActiveTab,
  focusPane,
  showWelcomePane,
  moveTab,
  splitWithTab,
  resizeSplit,
  setLayout,
  track,
} = uiSlice.actions;


export const store = configureStore({
  reducer: { ui: uiSlice.reducer, settingsCache: settingsCacheReducer, panel: panelReducer },
  // Always attach the logger; it self-gates on isDevMode (no-op in production).
  middleware: (getDefault) => getDefault().concat(devLogger),
  devTools: isDevMode,
});

// Mirror the section to localStorage on every change, so `readInitialSection`
// restores it on the next load.
if (typeof window !== "undefined") {
  store.subscribe(() => {
    try {
      const ui = store.getState().ui;
      localStorage.setItem(SECTION_KEY, ui.section);
      localStorage.setItem(WORKSPACE_KEY, serializeLayout(ui.layout));
      // Keep the legacy flat list in sync too, so a rollback to the pre-tiling
      // build still finds the open tabs.
      localStorage.setItem(TABS_KEY, JSON.stringify(ui.openTabIds));
    } catch {
      /* ignore */
    }
  });
}

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
