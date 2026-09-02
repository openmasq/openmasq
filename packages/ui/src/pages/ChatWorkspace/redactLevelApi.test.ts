import { describe, expect, it, vi } from "vitest";
import { buildRedactLevelApi, hasEffectiveOverride } from "./redactLevelApi";
import { categoriesForLevel } from "../../privacy/privacyLevel";
import type { Conversation, Settings } from "../../types";

/**
 * The api's two writes are the modal's; what this file pins is what they RETURN — the
 * snapshot `restore` takes back — and the one fact the ⋯ menu tags: a thread that
 * actually deviates from the default.
 */
const settings = { redactCategories: categoriesForLevel("renforce") } as Settings;
const conv = (cats?: Conversation["redactCategories"]) =>
  ({ id: "c1", redactCategories: cats }) as Conversation;

describe("buildRedactLevelApi", () => {
  it("un niveau posé sur la conversation rend l'override précédent, et restore le remet", () => {
    const onChangeConversation = vi.fn();
    const api = buildRedactLevelApi({
      settings,
      onChangeSettings: vi.fn(),
      conversation: conv({ name: false }),
      onChangeConversation,
    })!;
    const snap = api.onApplyConversation!("strict");
    expect(snap).toEqual({ scope: "conversation", convId: "c1", cats: { name: false } });
    expect(onChangeConversation).toHaveBeenLastCalledWith("c1", categoriesForLevel("strict"));
    api.restore(snap);
    expect(onChangeConversation).toHaveBeenLastCalledWith("c1", { name: false });
  });

  /* A thread with NO override restores to « no override » — never to a copy of the
     default frozen at the click, which would stop following the default afterwards. */
  it("restaurer une conversation sans override écrit un override VIDE", () => {
    const onChangeConversation = vi.fn();
    const api = buildRedactLevelApi({
      settings,
      onChangeSettings: vi.fn(),
      conversation: conv(undefined),
      onChangeConversation,
    })!;
    api.restore(api.onApplyConversation!("standard"));
    expect(onChangeConversation).toHaveBeenLastCalledWith("c1", {});
  });

  it("sans conversation, le défaut reçoit le niveau et restore le rend", () => {
    const onChangeSettings = vi.fn();
    const api = buildRedactLevelApi({ settings, onChangeSettings })!;
    expect(api.onApplyConversation).toBeUndefined();
    const snap = api.onApplyAlways("strict");
    expect(onChangeSettings).toHaveBeenLastCalledWith({
      ...settings,
      redactCategories: categoriesForLevel("strict"),
    });
    api.restore(snap);
    expect(onChangeSettings).toHaveBeenLastCalledWith(settings);
  });

  it("compte les catégories imposées, et sait si la conversation dévie", () => {
    const api = buildRedactLevelApi({
      settings,
      onChangeSettings: vi.fn(),
      conversation: conv({ name: false }),
      onChangeConversation: vi.fn(),
      forcedCategories: ["apikey", "secret"],
    })!;
    expect(api.forcedCount).toBe(2);
    expect(api.overridden).toBe(true);
  });
});

describe("hasEffectiveOverride", () => {
  const global = categoriesForLevel("renforce");
  it("aucun override, ou un override qui redit le défaut → pas de déviation", () => {
    expect(hasEffectiveOverride(global, undefined)).toBe(false);
    expect(hasEffectiveOverride(global, {})).toBe(false);
    expect(hasEffectiveOverride(global, { name: global.name })).toBe(false);
  });
  it("une clé qui change l'état effectif → déviation", () => {
    expect(hasEffectiveOverride(global, { name: !global.name })).toBe(true);
  });
});
