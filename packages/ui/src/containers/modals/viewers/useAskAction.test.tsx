// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { mount } from "../../../testKit";
import { useAskAction, ASK_LABEL, type AskState } from "./useAskAction";

/** Le bouton réduit à ce que le hook en fait — le visualiseur n'ajoute que l'icône. */
function AskButton({ onAsk }: { onAsk?: () => void | Promise<unknown> }) {
  const ask = useAskAction(onAsk);
  return (
    <button type="button" className="fv-ask" onClick={ask.run} disabled={ask.state === "pending"}>
      {ASK_LABEL[ask.state]}
    </button>
  );
}

const label = (m: { find: (s: string) => HTMLElement }): string =>
  m.find(".fv-ask").textContent ?? "";
const state = (m: { find: (s: string) => HTMLElement }): AskState =>
  (Object.keys(ASK_LABEL) as AskState[]).find((k) => ASK_LABEL[k] === label(m))!;

describe("« Demander » — l'attente se voit, la panne se dit", () => {
  it("montre l'attente, puis revient au repos", async () => {
    let resolve!: () => void;
    const onAsk = vi.fn(() => new Promise<void>((r) => (resolve = r)));
    const m = await mount(<AskButton onAsk={onAsk} />);

    expect(state(m)).toBe("idle");
    await m.click(".fv-ask");
    expect(state(m)).toBe("pending");
    expect(m.find<HTMLButtonElement>(".fv-ask").disabled).toBe(true);

    await m.click(".fv-ask"); // inerte pendant l'attente
    resolve();
    await m.rerender(<AskButton onAsk={onAsk} />);
    expect(onAsk).toHaveBeenCalledTimes(1);
    await m.unmount();
  });

  it("un SECOND clic pendant l'attente ne relance rien", async () => {
    // La régression visée : le bouton ne changeait pas d'état, donc on recliquait — et
    // chaque clic relançait lecture + OCR, puis joignait le fichier une fois de plus.
    const onAsk = vi.fn(() => new Promise<void>(() => {}));
    const m = await mount(<AskButton onAsk={onAsk} />);
    await m.click(".fv-ask");
    await m.click(".fv-ask");
    await m.click(".fv-ask");
    expect(onAsk).toHaveBeenCalledTimes(1);
    await m.unmount();
  });

  it("une panne se DIT, elle ne disparaît pas dans un catch vide", async () => {
    const m = await mount(<AskButton onAsk={() => Promise.reject(new Error("illisible"))} />);
    await m.click(".fv-ask");
    await m.rerender(<AskButton onAsk={() => Promise.reject(new Error("illisible"))} />);
    expect(label(m)).toMatch(/réessayer/i);
    expect(m.find<HTMLButtonElement>(".fv-ask").disabled).toBe(false);
    await m.unmount();
  });

  it("un échec SYNCHRONE est traité comme un échec, pas ignoré", async () => {
    const m = await mount(
      <AskButton
        onAsk={() => {
          throw new Error("boum");
        }}
      />,
    );
    await m.click(".fv-ask");
    expect(state(m)).toBe("failed");
    await m.unmount();
  });

  it("un geste SYNCHRONE ne fait jamais clignoter le bouton", async () => {
    // Les autres appelants du visualiseur rendent `void` : ils doivent se comporter
    // exactement comme avant — aucun état d'attente, aucun blocage.
    const onAsk = vi.fn();
    const m = await mount(<AskButton onAsk={onAsk} />);
    await m.click(".fv-ask");
    expect(state(m)).toBe("idle");
    await m.click(".fv-ask");
    expect(onAsk).toHaveBeenCalledTimes(2);
    await m.unmount();
  });
});
