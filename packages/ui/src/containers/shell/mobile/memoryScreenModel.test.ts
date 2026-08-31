import { getMessages } from "@openmasq/i18n";
import { describe, expect, it } from "vitest";
import { groupMemoryCards } from "./memoryScreenModel";
import { MEMORY_CATEGORIES } from "../../../memory";
import type { MemoryCard } from "../../../types";

const mk = (id: string, cat: string): MemoryCard =>
  ({ id, entity: `E${id}`, facts: "", cat, createdAt: 0, updatedAt: 0 }) as MemoryCard;

const fr = getMessages("fr");

describe("groupMemoryCards", () => {
  it("keeps the store's category ORDER and drops only empty groups", () => {
    const groups = groupMemoryCards([mk("a", "projet"), mk("b", "personne"), mk("c", "projet")], fr);
    expect(groups.map((g) => g.id)).toEqual(["personne", "projet"]);
    expect(groups.map((g) => g.cards.length)).toEqual([1, 2]);
    // The order is the store's, not first-seen — `projet` was seen first yet sorts last.
    const order = MEMORY_CATEGORIES.map((c) => c.id);
    expect(order.indexOf("personne")).toBeLessThan(order.indexOf("projet"));
  });

  it("never loses a card to an unknown or missing category", () => {
    // A card the user can't see is a card they can't delete — and this screen is the
    // only place a phone can review what the app remembers.
    const groups = groupMemoryCards(
      [mk("a", "n-importe-quoi"), { ...mk("b", ""), cat: undefined as unknown as MemoryCard["cat"] }],
      fr,
    );
    const seen = groups.flatMap((g) => g.cards.map((c) => c.id));
    expect(seen.sort()).toEqual(["a", "b"]);
    expect(groups.map((g) => g.id)).toEqual(["autre"]);
  });

  it("returns nothing for an empty store", () => {
    expect(groupMemoryCards([], fr)).toEqual([]);
  });
});
