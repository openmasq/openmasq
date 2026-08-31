// @vitest-environment jsdom
import { describe, expect, it, beforeAll } from "vitest";
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { SpreadsheetViewer } from "./SpreadsheetViewer";

/**
 * Regression: the virtualised grid tags the <table> with a modifier so it can switch
 * to `table-layout: fixed`. That modifier MUST stay namespaced (`fv-grid-fixed`) — a
 * bare `fixed` collides with Tailwind's `.fixed` utility (`position: fixed`), which
 * wins the cascade, yanks the table out of flow, collapses `.fv-sheet-scroll` to 0,
 * and the grid spills off the modal with NO scrollbar (both axes dead). Pin the class
 * so nobody reintroduces the bare token.
 */

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // jsdom has no ResizeObserver; the viewer observes its scroll container.
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

/** A CSV wide enough to matter and tall enough to VIRTUALISE (> 80 data rows). */
function wideCsv(): Uint8Array {
  const cols = 6;
  const rows = 90;
  const header = Array.from({ length: cols }, (_, c) => `col_${c + 1}`).join(",");
  const body = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => `v_${r + 1}_${c + 1}`).join(","),
  ).join("\n");
  return new TextEncoder().encode(`${header}\n${body}\n`);
}

async function renderSheet(
  props: Partial<React.ComponentProps<typeof SpreadsheetViewer>> = {},
): Promise<HTMLElement> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(SpreadsheetViewer, { bytes: wideCsv(), csv: true, ...props }));
  });
  // parse() lazy-imports `xlsx` (a real module load — macrotasks, not just
  // microtasks) then setState — poll on real ticks until the grid mounts.
  // ⚠️ The budget is a REAL wall-clock second, not simulated time: under the load of
  // the full suite (~600 files in parallel), 100 × 10 ms stopped being enough and the
  // test would fail « grid never mounted » even though it passes alone. 4 s doesn't slow
  // anything down (the loop exits as soon as the grid mounts), and removes the false red.
  let grid: HTMLTableElement | null = null;
  for (let i = 0; i < 400 && !grid; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    grid = container.querySelector<HTMLTableElement>(".fv-grid");
  }
  if (!grid) throw new Error("grid never mounted");
  return container;
}

const renderGrid = async (): Promise<HTMLTableElement> =>
  (await renderSheet()).querySelector<HTMLTableElement>(".fv-grid")!;

describe("SpreadsheetViewer — virtualised grid class", () => {
  it("tags the virtualised table with `fv-grid-fixed`, never a bare `fixed`", async () => {
    const grid = await renderGrid();
    // The sheet has 90 rows → virtualised → the fixed-layout modifier is applied.
    expect(grid.classList.contains("fv-grid-fixed")).toBe(true);
    // A bare `fixed` is Tailwind's `position: fixed` utility — must never appear here.
    expect(grid.classList.contains("fixed")).toBe(false);
  });
});

describe("SpreadsheetViewer — lecteur seul (édition retirée)", () => {
  it("n'offre jamais de barre d'édition", async () => {
    const c = await renderSheet();
    expect(c.querySelector(".fv-edit-bar")).toBeNull();
  });
});

/**
 * The CSV bug, end to end: a redacted value in a spreadsheet cell showed NO highlight,
 * while the same value in the chat and in a PDF showed its colour. The grid was emitting
 * `redaction-mark tone-<hue>` — a class that maps nothing for a mark — so the fill fell
 * back to a near-invisible slate. `styles/palette.parity.test.ts` guards the class
 * repo-wide; this pins the surface the user actually reported.
 */
describe("SpreadsheetViewer — un CSV redacted est SURLIGNÉ", () => {
  const csv = () => new TextEncoder().encode("client,montant\nAugustin Vaudel,1000\n");
  const reps = [
    { real: "Augustin Vaudel", fake: "Hugo Cros", tone: "sky", kind: "name" },
  ] as React.ComponentProps<typeof SpreadsheetViewer>["replacements"];

  it("marque la valeur et lui donne sa TEINTE (`hl-`, la seule carte de teintes)", async () => {
    const el = await renderSheet({ bytes: csv(), csv: true, replacements: reps });
    const marks = [...el.querySelectorAll(".redaction-mark")];
    expect(marks.length, "aucune marque dans la grille CSV").toBeGreaterThan(0);
    const m = marks.find((x) => x.textContent === "Augustin Vaudel")!;
    expect(m, "la valeur réelle n'est pas marquée").toBeTruthy();
    // The tone arrives via `.hl-<hue>`; a `tone-<hue>` maps nothing for a mark.
    expect(m.classList.contains("hl-sky")).toBe(true);
    expect([...m.classList].some((c) => c.startsWith("tone-"))).toBe(false);
  });

  it("marque aussi le FAUX — les octets redacted portent le faux, pas le réel", async () => {
    const scrubbed = new TextEncoder().encode("client,montant\nHugo Cros,1000\n");
    const el = await renderSheet({ bytes: scrubbed, csv: true, replacements: reps });
    const m = [...el.querySelectorAll(".redaction-mark")].find((x) => x.textContent === "Hugo Cros");
    expect(m, "l'onglet Redacted montre le faux SANS surlignage").toBeTruthy();
    expect(m!.classList.contains("hl-sky")).toBe(true);
  });
});

/**
 * The send CUT, made visible in the grid: on a big CSV, only the rows
 * within the bound are detected AND sent — the rest never leave the
 * machine. Without this rendering, they used to show in clear in the redacted view and
 * read as « unredacted parts » (the bug reported on 27/08).
 */
describe("SpreadsheetViewer — la coupe d'envoi est visible, jamais mensongère", () => {
  it("grise les lignes au-delà de `cutRow` et l'explique en toutes lettres", async () => {
    // 10: the boundary falls WITHIN the first virtualised window (jsdom only
    // mounts about thirty), so both sides are visible at once.
    const el = await renderSheet({ cutRow: 10 });
    // Visible (virtualised) rows: those whose number is past the cut are greyed out.
    const rows = [...el.querySelectorAll("tbody tr:not(.fv-spacer)")];
    const sent = rows.filter((r) => !r.classList.contains("fv-row-unsent"));
    const unsent = rows.filter((r) => r.classList.contains("fv-row-unsent"));
    expect(sent.length).toBeGreaterThan(0);
    expect(unsent.length).toBeGreaterThan(0);
    for (const r of sent) {
      const num = Number(r.querySelector(".fv-grid-rowhead")?.textContent);
      expect(num).toBeLessThanOrEqual(10);
    }
    for (const r of unsent) {
      const num = Number(r.querySelector(".fv-grid-rowhead")?.textContent);
      expect(num).toBeGreaterThan(10);
    }
    // The note says what the grey-out means — doesn't leave ≠ left in clear.
    expect(el.querySelector(".fv-cut-note")?.textContent).toContain("lignes 1 à 10");
    expect(el.querySelector(".fv-cut-note")?.textContent).toContain("ne quittent jamais la machine");
  });

  it("sans coupe (`cutRow` absent) : aucune ligne grisée, aucune note", async () => {
    const el = await renderSheet();
    expect(el.querySelector(".fv-row-unsent")).toBeNull();
    expect(el.querySelector(".fv-cut-note")).toBeNull();
  });
});
