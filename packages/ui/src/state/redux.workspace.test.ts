import { describe, it, expect, beforeEach } from "vitest";
import {
  store,
  openTab,
  closeTab,
  splitWithTab,
  setLayout,
  setActiveTab,
  showWelcomePane,
  panelOpenBrowser,
  panelOpenFile,
  panelOpenArtifact,
  panelSelect,
  panelCloseItem,
  panelHide,
} from "./redux";
import { emptyLayout, findLeaf } from "../workspace/layout";

/** Reset to a known single empty pane before each test (the store is a singleton). */
beforeEach(() => {
  store.dispatch(setLayout(emptyLayout("root")));
});

describe("redux workspace slice (layout-backed)", () => {
  it("openTab appends to the focused pane and keeps openTabIds derived", () => {
    store.dispatch(openTab("A"));
    store.dispatch(openTab("B"));
    const ui = store.getState().ui;
    // openTabIds is DERIVED as bare conv ids (un-namespaced); the layout itself holds
    // NAMESPACED tab refs ("chat:<id>") so one strip can also carry browser/artifact tabs.
    expect(ui.openTabIds).toEqual(["A", "B"]);
    expect(findLeaf(ui.layout, "root")!.tabs).toEqual(["chat:A", "chat:B"]);
    expect(findLeaf(ui.layout, "root")!.activeTab).toBe("chat:B");
  });

  it("showWelcomePane deselects without closing — « Nouvelle conversation » creates nothing", () => {
    store.dispatch(openTab("A"));
    store.dispatch(openTab("B"));
    store.dispatch(showWelcomePane());
    const ui = store.getState().ui;
    // The pane shows the welcome (no active conversation); its tabs — and their
    // persisted list — are untouched. The conversation is minted at the first send.
    expect(findLeaf(ui.layout, "root")!.activeTab).toBeNull();
    expect(ui.openTabIds).toEqual(["A", "B"]);
    // A tab click leaves the welcome again.
    store.dispatch(setActiveTab({ paneId: "root", convId: "A" }));
    expect(findLeaf(store.getState().ui.layout, "root")!.activeTab).toBe("chat:A");
  });

  it("panel slice: everything non-chat shares ONE panel; closing re-anchors", () => {
    store.dispatch(panelOpenBrowser());
    store.dispatch(panelOpenFile({ id: "f1", name: "doc.pdf", mime: "application/pdf", convId: "c1" }));
    store.dispatch(panelOpenArtifact({ id: "a1", kind: "csv", lang: "csv", title: "Ventes", text: "a,b" }));
    let s = store.getState().panel;
    expect(s.items.map((i) => i.kind)).toEqual(["browser", "file", "artifact"]);
    expect(s.activeId).toBe("artifact-a1");
    expect(s.open).toBe(true);
    // Re-opening an existing item focuses it, never duplicates.
    store.dispatch(panelOpenFile({ id: "f1", name: "doc.pdf" }));
    s = store.getState().panel;
    expect(s.items.length).toBe(3);
    expect(s.activeId).toBe("f1");
    // Hiding keeps the items (the rail brings them back); select re-opens.
    store.dispatch(panelHide());
    expect(store.getState().panel.open).toBe(false);
    expect(store.getState().panel.items.length).toBe(3);
    store.dispatch(panelSelect("browser"));
    expect(store.getState().panel.open).toBe(true);
    expect(store.getState().panel.activeId).toBe("browser");
    // Closing the active item re-anchors; closing the LAST collapses the panel.
    store.dispatch(panelCloseItem("browser"));
    expect(store.getState().panel.activeId).toBe("artifact-a1");
    store.dispatch(panelCloseItem("artifact-a1"));
    store.dispatch(panelCloseItem("f1"));
    s = store.getState().panel;
    expect(s.items).toEqual([]);
    expect(s.open).toBe(false);
    expect(s.activeId).toBeNull();
  });

  // Le panneau n'a plus d'agrandissement : la conversation ne peut plus être masquée par
  // aucun geste. C'est l'invariant qui remplace l'ancien test du bascule.
  it("replier le panneau GARDE ses éléments — seule la croix en retire un", () => {
    store.dispatch(panelOpenBrowser());
    store.dispatch(panelHide());
    const s = store.getState().panel;
    expect(s.open).toBe(false);
    expect(s.items.map((i) => i.id)).toEqual(["browser"]);
  });

  it("splitWithTab splits the pane and moves a conversation into the new one", () => {
    store.dispatch(openTab("A"));
    store.dispatch(openTab("B"));
    store.dispatch(
      splitWithTab({ targetPane: "root", convId: "B", direction: "row", position: "after", newPaneId: "p2" }),
    );
    const ui = store.getState().ui;
    expect(ui.layout.root.kind).toBe("split");
    expect(findLeaf(ui.layout, "root")!.tabs).toEqual(["chat:A"]);
    expect(findLeaf(ui.layout, "p2")!.tabs).toEqual(["chat:B"]);
    expect(ui.layout.focusedPane).toBe("p2");
    expect(new Set(ui.openTabIds)).toEqual(new Set(["A", "B"]));
  });

  it("closeTab collapses an emptied pane back to a single leaf", () => {
    store.dispatch(openTab("A"));
    store.dispatch(openTab("B"));
    store.dispatch(
      splitWithTab({ targetPane: "root", convId: "B", direction: "row", position: "after", newPaneId: "p2" }),
    );
    store.dispatch(closeTab("A")); // "root" empties → collapse to p2
    const ui = store.getState().ui;
    expect(ui.layout.root.kind).toBe("leaf");
    expect(ui.openTabIds).toEqual(["B"]);
  });

  it("setActiveTab focuses the target pane", () => {
    store.dispatch(openTab("A"));
    store.dispatch(openTab("B"));
    store.dispatch(
      splitWithTab({ targetPane: "root", convId: "B", direction: "row", position: "after", newPaneId: "p2" }),
    );
    store.dispatch(setActiveTab({ paneId: "root", convId: "A" }));
    expect(store.getState().ui.layout.focusedPane).toBe("root");
  });
});
