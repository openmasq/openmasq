// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { mount } from "../../testKit";
import { StatusChip } from "./StatusChip";

describe("StatusChip", () => {
  it("ne montre que son titre tant qu'on ne l'ouvre pas — c'est tout l'intérêt", async () => {
    const m = await mount(
      <StatusChip tone="warning" title="Hors ligne" message="Reconnexion en cours…" />,
    );
    expect(m.find(".kchip-label").textContent).toBe("Hors ligne");
    expect(m.maybe(".kchip-detail")).toBeNull();
    await m.click(".kchip-head");
    expect(m.find(".kchip-msg").textContent).toContain("Reconnexion");
    await m.unmount();
  });

  it("l'action n'est atteignable qu'ouverte, et ne part qu'au clic", async () => {
    const onClick = vi.fn();
    const m = await mount(
      <StatusChip
        tone="warning"
        title="Reconnexion nécessaire : Slack"
        message="Perdu."
        action={{ label: "Reconnecter", onClick }}
      />,
    );
    expect(m.maybe(".kchip-act")).toBeNull();
    await m.click(".kchip-head");
    expect(onClick).not.toHaveBeenCalled();
    await m.click(".kchip-act");
    expect(onClick).toHaveBeenCalledTimes(1);
    await m.unmount();
  });

  it("sans onClose il n'y a rien à masquer — une panne ne se referme pas", async () => {
    const m = await mount(<StatusChip tone="warning" title="Hors ligne" message="…" />);
    expect(m.maybe(".kchip-x")).toBeNull();
    await m.unmount();

    const onClose = vi.fn();
    const m2 = await mount(
      <StatusChip tone="info" title="Modèles gratuits" message="…" onClose={onClose} />,
    );
    await m2.click(".kchip-x");
    expect(onClose).toHaveBeenCalledTimes(1);
    await m2.unmount();
  });

  it("sans message ni action, rien à déplier : pas de bouton, pas de chevron", async () => {
    const m = await mount(<StatusChip tone="info" title="Rien à dire de plus" />);
    expect(m.maybe("button.kchip-head")).toBeNull();
    expect(m.maybe(".kchip-caret")).toBeNull();
    await m.unmount();
  });
});
