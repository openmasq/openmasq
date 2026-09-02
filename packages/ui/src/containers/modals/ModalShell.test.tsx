// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { ModalShell } from "./ModalShell";
import { mount } from "../../testKit";

/**
 * `ModalShell` is THE dialog of the app: every modal inherits what is pinned here, and
 * a regression here is a regression in thirty places at once. What a dialog owes the
 * keyboard: role + label for a reader, focus that enters and stays, Escape that closes
 * the layer it was aimed at and no other, and focus handed back to the opener.
 */

/** A keydown FROM the focused element — the way a real key travels (a dispatch on
 *  `document` never passes through the panel, so it would test nothing here). */
const press = async (key: string, init: KeyboardEventInit = {}) => {
  await act(async () => {
    (document.activeElement ?? document.body).dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }),
    );
  });
};

const dialog = (onClose = () => {}) => (
  <ModalShell onClose={onClose} title="Supprimer ?" eyebrow="COFFRE">
    <button type="button" className="first">
      Annuler
    </button>
    <button type="button" className="last">
      Supprimer
    </button>
  </ModalShell>
);

afterEach(() => {
  document.body.innerHTML = "";
});

describe("ModalShell — un vrai dialogue", () => {
  it("porte role/aria-modal, est nommé par son titre, et prend le focus à l'ouverture", async () => {
    const ui = await mount(dialog());
    const panel = ui.find(".modal-panel");
    expect(panel.getAttribute("role")).toBe("dialog");
    expect(panel.getAttribute("aria-modal")).toBe("true");
    const labelId = panel.getAttribute("aria-labelledby");
    expect(labelId).toBeTruthy();
    expect(document.getElementById(labelId!)?.textContent).toBe("Supprimer ?");
    expect(ui.find(".modal-eyebrow").textContent).toBe("COFFRE");
    // The panel itself, not its first button: the reader announces the title first.
    expect(document.activeElement).toBe(panel);
    await ui.unmount();
  });

  it("piège Tab aux deux bouts, et ramène un focus échappé au premier contrôle", async () => {
    const ui = await mount(dialog());
    const first = ui.find(".first");
    const last = ui.find(".last");
    last.focus();
    await press("Tab");
    expect(document.activeElement).toBe(first);
    await press("Tab", { shiftKey: true });
    expect(document.activeElement).toBe(last);
    // Focus fled to the body (a click on the scrim): the next Tab re-enters the dialog.
    (document.activeElement as HTMLElement).blur();
    await press("Tab");
    expect(document.activeElement).toBe(first);
    await ui.unmount();
  });

  it("Échap ferme — sauf quand une couche intérieure l'a déjà consommé", async () => {
    const onClose = vi.fn();
    const ui = await mount(dialog(onClose));
    // An inner layer (the selection menu, a corner menu) marks the key consumed.
    const consume = (e: KeyboardEvent) => e.key === "Escape" && e.preventDefault();
    document.addEventListener("keydown", consume, true);
    await press("Escape");
    expect(onClose).not.toHaveBeenCalled();
    document.removeEventListener("keydown", consume, true);
    await press("Escape");
    expect(onClose).toHaveBeenCalledTimes(1);
    await ui.unmount();
  });

  it("rend le focus au déclencheur à la fermeture, et respecte un autoFocus intérieur", async () => {
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();
    const ui = await mount(
      <ModalShell onClose={() => {}} title="Clé">
        <input autoFocus className="key" />
      </ModalShell>,
    );
    // The dialog chose where focus goes; the shell does not override it.
    expect(document.activeElement).toBe(ui.find(".key"));
    await ui.unmount();
    expect(document.activeElement).toBe(trigger);
  });

  it("empilés, seul le dialogue du dessus piège — et le dessous récupère le focus après", async () => {
    const below = await mount(dialog());
    const belowFirst = below.find(".first");
    belowFirst.focus();
    const above = await mount(
      <ModalShell onClose={() => {}} title="Confirmer">
        <button type="button" className="only">
          OK
        </button>
      </ModalShell>,
    );
    const only = above.find(".only");
    only.focus();
    await press("Tab");
    // The buried dialog's trap did not yank focus back to ITS first control.
    expect(document.activeElement).toBe(only);
    await above.unmount();
    expect(document.activeElement).toBe(belowFirst);
    await below.unmount();
  });

  it("le mode `panel` n'est pas un dialogue : ni rôle, ni scrim, ni piège — Échap depuis lui ferme", async () => {
    const onClose = vi.fn();
    const ui = await mount(
      <ModalShell onClose={onClose} panel>
        <button type="button">x</button>
      </ModalShell>,
    );
    expect(ui.maybe(".modal-scrim")).toBeNull();
    expect(ui.maybe("[role='dialog']")).toBeNull();
    expect(document.activeElement).toBe(document.body);
    ui.find(".modal-inline-panel").focus();
    await press("Escape");
    expect(onClose).toHaveBeenCalledTimes(1);
    await ui.unmount();
  });
});
