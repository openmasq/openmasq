// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { mount } from "../../testKit";
import { RESTART_SLOW_MS, UpdateReadyModal } from "./UpdateReadyModal";
import { getMessages } from "@openmasq/i18n";

/**
 * « Redémarrer maintenant » used to do nothing visible for several seconds: main tears
 * down the app's own child instances before handing off to ShipIt. The click must be
 * ACKNOWLEDGED at once, refuse a second click, and past a delay say how to get out.
 */
const fr = getMessages("fr").modals.updateReady;
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("UpdateReadyModal — the restart is acknowledged", () => {
  it("un clic dit « Redémarrage… », explique, et n'installe qu'une fois", async () => {
    const onInstall = vi.fn();
    const m = await mount(
      <UpdateReadyModal version="0.9.0" onClose={() => {}} onInstall={onInstall} />,
    );
    const primary = m.find<HTMLButtonElement>(".om-upd-foot .btn-primary");
    expect(primary.textContent).toBe(fr.restartNow);
    await m.click(primary);
    expect(onInstall).toHaveBeenCalledTimes(1);
    expect(primary.textContent).toBe(fr.restarting);
    expect(primary.disabled).toBe(true);
    expect(m.find(".om-upd-status").textContent).toBe(fr.restartingHint);
    await m.click(primary);
    expect(onInstall).toHaveBeenCalledTimes(1);
    await m.unmount();
  });

  it("passé le délai, la sortie de secours est dite et le bouton redevient « Réessayer »", async () => {
    const onInstall = vi.fn();
    const m = await mount(
      <UpdateReadyModal version="0.9.0" onClose={() => {}} onInstall={onInstall} />,
    );
    await m.click(".om-upd-foot .btn-primary");
    await act(async () => {
      vi.advanceTimersByTime(RESTART_SLOW_MS + 1);
    });
    expect(m.find(".om-upd-status").textContent).toBe(fr.restartSlow);
    const primary = m.find<HTMLButtonElement>(".om-upd-foot .btn-primary");
    expect(primary.disabled).toBe(false);
    expect(primary.textContent).toBe(fr.retry);
    await m.click(primary);
    expect(onInstall).toHaveBeenCalledTimes(2);
    await m.unmount();
  });
});
