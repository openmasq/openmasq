// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { useState } from "react";
import { mount } from "../../testKit";
import { MemoryView } from "./MemoryView";
import { useMemoryStore } from "../../state/useMemory";
import type { Settings } from "../../types";

/**
 * Le bouton « Nouvelle fiche » CÂBLÉ sur la vraie CRUD — nettoyage automatique compris.
 * Le placeholder portait un nom FIXE : `autoCleanMemory` refondait la deuxième fiche
 * dans la première (même clé, même catégorie) à l'instant de sa création, donc à partir
 * du deuxième clic le bouton ne faisait plus rien du tout.
 */
function Harness({ seen }: { seen: { entities: string[] } }) {
  const [settings, setSettings] = useState<Settings>({} as Settings);
  const memory = useMemoryStore(settings, setSettings);
  seen.entities = memory.memoire.cards.map((c) => c.entity);
  return (
    <MemoryView
      memoire={memory.memoire}
      memoryAuto={false}
      onToggleAuto={() => {}}
      onSetProfile={memory.setMemoryProfile}
      onAdd={memory.addMemoryCard}
      onUpdate={memory.updateMemoryCard}
      onRemove={memory.removeMemoryCard}
      onRestore={memory.restoreMemoryCard}
      onMerge={memory.mergeMemoryCards}
    />
  );
}

describe("MemoryView — « Nouvelle fiche »", () => {
  it("chaque clic pose une fiche de plus (la deuxième ne s'auto-détruit pas)", async () => {
    const seen = { entities: [] as string[] };
    const ui = await mount(<Harness seen={seen} />);
    const button = () =>
      ui.findAll("button").find((b) => b.textContent?.includes("Nouvelle fiche"))!;

    await ui.click(button());
    expect(seen.entities).toEqual(["Nouvelle fiche"]);

    await ui.click(button());
    expect(seen.entities).toHaveLength(2);
    expect(new Set(seen.entities).size).toBe(2);

    await ui.click(button());
    expect(seen.entities).toHaveLength(3);
    await ui.unmount();
  });
});
