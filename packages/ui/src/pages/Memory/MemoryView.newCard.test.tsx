// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { useState } from "react";
import { mount } from "../../testKit";
import { MemoryView } from "./MemoryView";
import { useMemoryStore } from "../../state/useMemory";
import type { Settings } from "../../types";

/**
 * The « Nouvelle fiche » button WIRED to the real CRUD — automatic cleanup included.
 * The placeholder carried a FIXED name: `autoCleanMemory` merged the second card
 * into the first (same key, same category) the instant it was created, so from
 * the second click onward the button did nothing at all.
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
