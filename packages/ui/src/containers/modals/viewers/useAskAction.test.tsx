// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { mount } from "../../../testKit";
import { useAskAction, ASK_LABEL, type AskState } from "./useAskAction";

/** The button reduced to what the hook makes of it — the viewer only adds the icon. */
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

    await m.click(".fv-ask"); // inert while pending
    resolve();
    await m.rerender(<AskButton onAsk={onAsk} />);
    expect(onAsk).toHaveBeenCalledTimes(1);
    await m.unmount();
  });

  it("un SECOND clic pendant l'attente ne relance rien", async () => {
    // The targeted regression: the button didn't change state, so it got clicked again — and
    // each click relaunched read + OCR, then attached the file once more.
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
    // The other callers of the viewer return `void`: they must behave exactly as before
    // — no pending state, no blocking.
    const onAsk = vi.fn();
    const m = await mount(<AskButton onAsk={onAsk} />);
    await m.click(".fv-ask");
    expect(state(m)).toBe("idle");
    await m.click(".fv-ask");
    expect(onAsk).toHaveBeenCalledTimes(2);
    await m.unmount();
  });
});
