// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { act } from "react";
import { Markdown } from "../Markdown";
import { mount } from "../../../testKit";

/** KaTeX arrives through a lazy `import()`: the bubble paints first and upgrades a tick
 *  later. Let the module cache fill, then let the re-render land. */
const settle = async () => {
  for (let i = 0; i < 3; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
};

/**
 * The invariant: EVERY bubble typesets its math, not just the first one of the session.
 * The second mount is the whole point — it renders with the module cache already warm,
 * which is the state every message but the first is in, and the state in which a plugin
 * held bare in `useState` degrades into raw LaTeX (see `useKatexPlugin`).
 */
describe("useKatexPlugin — le rendu des maths ne dépend pas du rang de la bulle", () => {
  const MATH = "$$\\sum_n x[n]\\,h[2k-n]$$";

  it("typographie la première bulle (chargement à froid)", async () => {
    const ui = await mount(<Markdown content={MATH} />);
    await settle();
    expect(ui.maybe(".katex")).not.toBeNull();
    // ⚠️ Jamais sur `textContent` : KaTeX recopie la SOURCE dans son `<annotation>`
    // MathML, donc le LaTeX y figure même bien rendu. Ce qui distingue les deux états,
    // c'est le nœud NON typographié que remark-math laisse derrière lui.
    expect(ui.maybe("code.math-inline, code.math-display")).toBeNull();
    await ui.unmount();
  });

  it("typographie aussi les suivantes (cache module chaud)", async () => {
    const warm = await mount(<Markdown content={"$$x^2$$"} />);
    await settle();
    await warm.unmount();

    const ui = await mount(<Markdown content={MATH} />);
    // Aucun `settle` : le plugin est en cache, la toute première peinture doit déjà
    // porter les maths — c'est ce que voit l'utilisateur qui fait défiler sa conversation.
    expect(ui.maybe(".katex")).not.toBeNull();
    // ⚠️ Jamais sur `textContent` : KaTeX recopie la SOURCE dans son `<annotation>`
    // MathML, donc le LaTeX y figure même bien rendu. Ce qui distingue les deux états,
    // c'est le nœud NON typographié que remark-math laisse derrière lui.
    expect(ui.maybe("code.math-inline, code.math-display")).toBeNull();
    await ui.unmount();
  });
});
