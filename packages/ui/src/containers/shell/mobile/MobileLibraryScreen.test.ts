// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { store as reduxStore } from "../../../state/redux";
import { HostProvider, type Host, type FileMeta } from "../../../host";
import { MobileLibraryScreen } from "./MobileLibraryScreen";
import type { Conversation } from "../../../types";

/**
 * The mobile Bibliothèque is the first screen ported off the desktop layout, and two of
 * its properties break silently:
 *
 *  • the two segments must between them show EVERY file — a tableur or an audio file
 *    quietly vanishing is indistinguishable from "you have no files";
 *  • the action sheet must offer only what `host.db` can actually do. The kit draws a
 *    « Renommer » row and there is no rename capability behind it, so the temptation to
 *    add it back is permanent.
 */

beforeAll(() => {
  (
    globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

// `useLibraryFiles` sorts NEWEST FIRST, so the fixture dates the files itself instead
// of stamping `Date.now()` per call: four calls land in one millisecond on an idle
// machine (stable sort, declaration order) and straddle two on a loaded CI runner,
// which silently reverses the expected list.
const meta = (
  id: string,
  name: string,
  mime: string,
  createdAt: number,
): FileMeta => ({
  id,
  name,
  mime,
  redacted: false,
  createdAt,
});

const FILES: FileMeta[] = [
  meta("f1", "contrat.pdf", "application/pdf", 4_000),
  meta(
    "f2",
    "budget.xlsx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    3_000,
  ),
  meta("f3", "memo.m4a", "audio/mp4", 2_000),
  meta("f4", "photo.png", "image/png", 1_000),
];

const conv = [
  {
    id: "c1",
    title: "Conv",
    messages: [],
    vault: {},
    createdAt: 0,
    updatedAt: 0,
  },
] as unknown as Conversation[];

/** A host with the file LISTING only — no openFile, no deleteFile, no loadFile. */
const listOnly = { db: { listFiles: async () => FILES } } as unknown as Host;
const withFileActions = {
  db: {
    listFiles: async () => FILES,
    openFile: async () => true,
    deleteFile: async () => {},
  },
} as unknown as Host;

// The sheet PORTALS out of the component, so assertions read `document.body` — which
// makes a leftover tree from a previous test indistinguishable from this one's.
const mounted: { unmount: () => void }[] = [];
afterEach(() => {
  for (const r of mounted.splice(0)) act(() => r.unmount());
  document.body.innerHTML = "";
});

async function mount(host: Host): Promise<HTMLDivElement> {
  const container = document.createElement("div");
  // BottomSheet portals into the mobile shell root when there is one.
  container.className = "app-mobile";
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted.push(root);
  await act(async () => {
    // `children` goes in the props object, not the third argument: react-redux's
    // Provider types require it there.
    root.render(
      React.createElement(Provider, {
        store: reduxStore,
        children: React.createElement(HostProvider, {
          value: host,
          children: React.createElement(MobileLibraryScreen, {
            conversations: conv,
          }),
        }),
      }),
    );
  });
  // `useLibraryFiles` resolves a Promise.all before it can render a row, so poll on REAL
  // ticks until the ROWS are there. Waiting on the loading branch alone is not enough —
  // React can commit the resolved-but-empty frame first — and a fixed number of microtask
  // flushes passes on an idle machine then fails under a loaded one. Every fixture here
  // has files, so "a row exists" is the honest settle condition. A flaky test is worse
  // than no test.
  for (
    let i = 0;
    i < 600 && container.querySelectorAll(".mlib-row").length === 0;
    i++
  ) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
  }
  if (container.querySelectorAll(".mlib-row").length === 0)
    throw new Error("listing never settled — no file row rendered");
  return container;
}

const texts = (root: ParentNode, sel: string) =>
  [...root.querySelectorAll(sel)].map((n) => n.textContent?.trim() ?? "");

const openRowMenu = async (el: HTMLElement) => {
  const menu = el.querySelector<HTMLButtonElement>(".mlib-row-menu");
  if (!menu) throw new Error("no row menu — the list did not render");
  await act(async () => {
    menu.click();
  });
};

describe("MobileLibraryScreen", () => {
  it("lists every non-image file; images live in the grid instead", async () => {
    const el = await mount(listOnly);
    expect(texts(el, ".mlib-row-name")).toEqual([
      "contrat.pdf",
      "budget.xlsx",
      "memo.m4a",
    ]);
    expect(el.querySelectorAll(".mlib-grid").length).toBe(0);

    const imagesTab = [
      ...el.querySelectorAll<HTMLButtonElement>(".mobile-seg-btn"),
    ].find((b) => b.textContent === "Images")!;
    await act(async () => {
      imagesTab.click();
    });
    expect(el.querySelectorAll(".mlib-tile").length).toBe(1);
    expect(el.querySelectorAll(".mlib-row").length).toBe(0);
  });

  it("never offers an action the host cannot perform (no rename, ever)", async () => {
    const el = await mount(listOnly);
    await openRowMenu(el);
    const actions = texts(document.body, ".mlib-action");
    expect(actions).toEqual(["Ouvrir"]);
    expect(actions.join(" ")).not.toMatch(/Renommer/i);
  });

  it("adds the external-open and delete rows only when those host slots exist", async () => {
    const el = await mount(withFileActions);
    await openRowMenu(el);
    expect(texts(document.body, ".mlib-action")).toEqual([
      "Ouvrir",
      "Ouvrir dans l'app externe",
      "Supprimer",
    ]);
  });

  it("asks before deleting — the stored bytes are gone for good", async () => {
    const el = await mount(withFileActions);
    await openRowMenu(el);
    const del = [
      ...document.querySelectorAll<HTMLButtonElement>(".mlib-action"),
    ].find((b) => b.textContent?.includes("Supprimer"))!;
    await act(async () => {
      del.click();
    });
    // Nothing is removed until the dialog is confirmed.
    expect(el.querySelectorAll(".mlib-row").length).toBe(3);
    expect(document.body.textContent).toMatch(/irréversible/i);
  });
});
