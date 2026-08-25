// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useState } from "react";
import { mount } from "../testKit";
import { ViewModeToggle } from "./ViewModeToggle";
import { useViewMode, type ViewMode } from "../hooks/useViewMode";
import { BRAND } from "@openmasq/branding";

describe("ViewModeToggle", () => {
  it("annonce UN groupe exclusif, pas deux interrupteurs", async () => {
    // Deux bascules indépendantes se liraient « activé / activé » à la synthèse vocale,
    // alors que les deux modes s'excluent.
    const m = await mount(<ViewModeToggle mode="grid" onChange={() => {}} />);
    expect(m.find("[role='radiogroup']")).toBeTruthy();
    const radios = m.findAll("[role='radio']");
    expect(radios).toHaveLength(2);
    expect(radios.filter((r) => r.getAttribute("aria-checked") === "true")).toHaveLength(1);
    await m.unmount();
  });

  it("marque le mode COURANT, quel qu'il soit", async () => {
    const m = await mount(<ViewModeToggle mode="list" onChange={() => {}} />);
    const checked = m.findAll("[role='radio']").findIndex((r) => r.getAttribute("aria-checked") === "true");
    expect(checked).toBe(1); // grille d'abord, liste ensuite — l'ordre est le contrat
    await m.unmount();
  });

  it("rend le mode CLIQUÉ, pas l'inverse du courant", async () => {
    // Une bascule « inverse » se serait trompée le jour où un troisième mode arrive.
    const onChange = vi.fn();
    const m = await mount(<ViewModeToggle mode="list" onChange={onChange} />);
    await m.click(m.findAll("[role='radio']")[0]);
    expect(onChange).toHaveBeenCalledWith("grid");
    await m.unmount();
  });

  it("chaque bouton porte un libellé lisible — l'icône seule ne dit rien", async () => {
    const m = await mount(<ViewModeToggle mode="grid" onChange={() => {}} />);
    for (const r of m.findAll("[role='radio']")) expect(r.getAttribute("aria-label")).toMatch(/\S/);
    await m.unmount();
  });
});

function Probe({ scope }: { scope: "library" | "competences" }) {
  const [mode, setMode] = useViewMode(scope);
  return (
    <button type="button" onClick={() => setMode(mode === "grid" ? "list" : "grid")}>
      {mode}
    </button>
  );
}

describe("useViewMode", () => {
  beforeEach(() => localStorage.clear());

  it("démarre en GRILLE — le mode que tout écran sait dessiner", async () => {
    const m = await mount(<Probe scope="library" />);
    expect(m.find("button").textContent).toBe("grid");
    await m.unmount();
  });

  it("retient le choix d'une session à l'autre", async () => {
    const m = await mount(<Probe scope="library" />);
    await m.click("button");
    expect(m.find("button").textContent).toBe("list");
    await m.unmount();
    const again = await mount(<Probe scope="library" />);
    expect(again.find("button").textContent).toBe("list");
    await again.unmount();
  });

  it("un écran ne dicte pas l'affichage d'un AUTRE", async () => {
    // Une bibliothèque d'images se regarde en vignettes, une liste de compétences se lit
    // en lignes : une préférence globale forcerait à la refaire à chaque va-et-vient.
    const lib = await mount(<Probe scope="library" />);
    await lib.click("button");
    await lib.unmount();
    const comp = await mount(<Probe scope="competences" />);
    expect(comp.find("button").textContent).toBe("grid");
    await comp.unmount();
  });

  it("une valeur INCONNUE retombe sur la grille, elle ne casse pas l'écran", async () => {
    localStorage.setItem(`${BRAND.slug}.view.library`, "mosaïque-3d" as ViewMode);
    const m = await mount(<Probe scope="library" />);
    expect(m.find("button").textContent).toBe("grid");
    await m.unmount();
  });
});
