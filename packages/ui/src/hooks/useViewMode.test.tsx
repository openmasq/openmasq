// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { BRAND } from "@openmasq/branding";
import { mount } from "../testKit";
import { useViewMode, VIEW_MODES, type ViewScope } from "./useViewMode";

/** The Mémoire's pair differs in KIND from the others (list ⇄ graph, not grid ⇄ list) —
 *  these pin that each screen opens on ITS default and only ever renders a mode it knows. */
function Probe({ scope }: { scope: ViewScope }) {
  const [mode, setMode] = useViewMode(scope);
  const [a, b] = VIEW_MODES[scope];
  return (
    <button type="button" onClick={() => setMode(mode === a ? b : a)}>
      {mode}
    </button>
  );
}

describe("useViewMode — per-screen default", () => {
  beforeEach(() => localStorage.clear());

  it("la Mémoire s'ouvre en LISTE, la Bibliothèque en GRILLE", async () => {
    const mem = await mount(<Probe scope="memory" />);
    expect(mem.find("button").textContent).toBe("list");
    await mem.unmount();
    const lib = await mount(<Probe scope="library" />);
    expect(lib.find("button").textContent).toBe("grid");
    await lib.unmount();
  });

  it("le choix est retenu sous la clé de SON écran", async () => {
    const m = await mount(<Probe scope="memory" />);
    await m.click(m.find("button"));
    expect(m.find("button").textContent).toBe("graph");
    expect(localStorage.getItem(`${BRAND.slug}.view.memory`)).toBe("graph");
    expect(localStorage.getItem(`${BRAND.slug}.view.library`)).toBeNull();
    await m.unmount();
  });

  it("une valeur inconnue (ou d'un autre écran) retombe sur le défaut", async () => {
    // "grid" is a Library mode: the Mémoire cannot draw it.
    localStorage.setItem(`${BRAND.slug}.view.memory`, "grid");
    const m = await mount(<Probe scope="memory" />);
    expect(m.find("button").textContent).toBe("list");
    await m.unmount();
  });
});
