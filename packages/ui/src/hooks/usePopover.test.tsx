// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { usePopover } from "./usePopover";
import { clickOutside, fireWindow, mount, pressKey } from "../testKit";

/**
 * The dismissal contract, pinned once for the nine menus that used to hand-write it.
 * Each case here is a way one of those copies had already drifted.
 */

function Menu({ anchor }: { anchor?: boolean }) {
  const p = usePopover<HTMLButtonElement, HTMLDivElement>(
    anchor ? { anchor: { width: 200, align: "right" } } : {},
  );
  return (
    <div>
      <button ref={p.triggerRef} onClick={p.toggle}>
        trigger
      </button>
      {p.open && (
        <div ref={p.menuRef} data-testid="menu" style={p.style ?? undefined}>
          <button className="item">item</button>
        </div>
      )}
    </div>
  );
}

describe("usePopover — dismissal", () => {
  it("le déclencheur ouvre, puis FERME (sans se rouvrir aussitôt)", async () => {
    const ui = await mount(<Menu />);
    await ui.click("button");
    expect(ui.maybe("[data-testid=menu]")).not.toBeNull();
    // The trap: if the « outside click » test doesn't ALSO check the trigger's
    // ref, this click closes then reopens in the same gesture.
    await ui.click("button");
    expect(ui.maybe("[data-testid=menu]")).toBeNull();
    await ui.unmount();
  });

  it("un mousedown à l'extérieur ferme — et un clic DANS le menu ne ferme pas", async () => {
    const ui = await mount(<Menu />);
    await ui.click("button");
    await ui.click(".item"); // an item doesn't close on its own: that's on the caller
    expect(ui.maybe("[data-testid=menu]")).not.toBeNull();
    await clickOutside();
    expect(ui.maybe("[data-testid=menu]")).toBeNull();
    await ui.unmount();
  });

  it("Échap ferme", async () => {
    const ui = await mount(<Menu />);
    await ui.click("button");
    await pressKey("Escape");
    expect(ui.maybe("[data-testid=menu]")).toBeNull();
    await ui.unmount();
  });

  it("une autre touche ne ferme pas", async () => {
    const ui = await mount(<Menu />);
    await ui.click("button");
    await pressKey("a");
    expect(ui.maybe("[data-testid=menu]")).not.toBeNull();
    await ui.unmount();
  });
});

describe("usePopover — ancrage (menu portalé)", () => {
  it("un menu ANCRÉ reçoit un style fixed et se ferme au scroll", async () => {
    const ui = await mount(<Menu anchor />);
    await ui.click("button");
    const menu = ui.find<HTMLDivElement>("[data-testid=menu]");
    expect(menu.style.position).toBe("fixed");
    expect(menu.style.width).toBe("200px");
    // A `fixed` popover that stays open while the content scrolls detaches from
    // its trigger — hence closing on scroll for ANCHORED ones ONLY.
    await fireWindow("scroll");
    expect(ui.maybe("[data-testid=menu]")).toBeNull();
    await ui.unmount();
  });

  it("un menu EN FLUX ignore le scroll (il suit son conteneur)", async () => {
    const ui = await mount(<Menu />);
    await ui.click("button");
    await fireWindow("scroll");
    expect(ui.maybe("[data-testid=menu]")).not.toBeNull();
    await ui.unmount();
  });

  it("aucun style tant que rien n'est ancré — le menu en flux se place tout seul", async () => {
    const ui = await mount(<Menu />);
    await ui.click("button");
    expect(ui.find<HTMLDivElement>("[data-testid=menu]").style.position).toBe("");
    await ui.unmount();
  });
});
