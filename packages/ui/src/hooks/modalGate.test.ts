// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import {
  agentBrowserBoundsEpoch,
  invalidateAgentBrowserBounds,
  isModalOpen,
  shouldHideAgentBrowser,
} from "./modalGate";

describe("modalGate — la fenêtre agent n'a pas d'ordre DOM", () => {
  it("aucune modale montée ⇒ rien à cacher", () => {
    expect(isModalOpen()).toBe(false);
    expect(shouldHideAgentBrowser()).toBe(false);
  });

  it("un scrim de modale la fait cacher, et la retirer la ré-autorise", () => {
    const scrim = document.createElement("div");
    scrim.className = "modal-scrim";
    document.body.appendChild(scrim);
    expect(shouldHideAgentBrowser()).toBe(true);
    scrim.remove();
    expect(shouldHideAgentBrowser()).toBe(false);
  });
});

describe("l'époque des bornes — le rattrapage entre les DEUX propriétaires", () => {
  it("monte à chaque invalidation, pour que la clé de déduplication change", () => {
    // That's where the drift came from: the GLOBAL owner reports the window back up, the
    // bounds WRITER keeps its key (same rectangle) and emits nothing — the window therefore
    // returns to where it was. The epoch breaks this equality, without depending on the rectangle.
    const before = agentBrowserBoundsEpoch();
    invalidateAgentBrowserBounds();
    expect(agentBrowserBoundsEpoch()).toBe(before + 1);
  });

  it("deux clés au rectangle IDENTIQUE diffèrent après une invalidation", () => {
    const key = () => `100,50,400,600,0,0,${agentBrowserBoundsEpoch()}`;
    const k1 = key();
    expect(key(), "sans remontée, même rectangle ⇒ même clé (pas d'IPC inutile)").toBe(k1);
    invalidateAgentBrowserBounds();
    expect(key(), "après une remontée, la même géométrie DOIT être réémise").not.toBe(k1);
  });
});
