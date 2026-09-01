import { getMessages } from "@openmasq/i18n";
import { describe, expect, it } from "vitest";
import { SIMPLE_MODEL_IDS } from "@openmasq/catalog";
import { MODELS, type ModelInfo } from "@openmasq/llm";
import { DEFAULT_MODEL_ID } from "../../prompt/models";
import { favoriteSet, simpleMenuModels, simpleMenuSections, toggleFavoriteModel } from "./simpleList";

const byId = (id: string): ModelInfo => {
  const m = MODELS.find((x) => x.id === id);
  if (!m) throw new Error(`id absent du registre : ${id}`);
  return m;
};
const ALL = MODELS.slice();

const fr = getMessages("fr");

describe("la liste favorite elle-même", () => {
  // ⚠️ A frozen list of ids and a registry that moves: without this test, removing a
  // model from the registry would silently empty the simplified view, and nobody would
  // see it before a user opens an empty menu.
  it("chaque id existe dans le registre", () => {
    const inconnus = SIMPLE_MODEL_IDS.filter((id) => !MODELS.some((m) => m.id === id));
    expect(inconnus, `ids absents du registre : ${inconnus.join(", ")}`).toEqual([]);
  });

  // The reason OpenRouter was chosen: this view must stay usable WITHOUT a
  // subscription. A Scaleway id would show up greyed out for whoever hasn't
  // subscribed — a « simplification » that offers nothing callable.
  it("n'est faite que d'ids OpenRouter (utilisables sur la clé personnelle)", () => {
    const horsSujet = SIMPLE_MODEL_IDS.filter((id) => byId(id).provider !== "openrouter");
    expect(horsSujet, `fournisseur non-OpenRouter : ${horsSujet.join(", ")}`).toEqual([]);
  });

  it("commence par des modèles gratuits — ce qu'on essaie sans rien engager", () => {
    expect(SIMPLE_MODEL_IDS[0]).toMatch(/:free$/);
    expect(SIMPLE_MODEL_IDS.filter((id) => id.endsWith(":free")).length).toBeGreaterThanOrEqual(2);
  });

  // The list opens on what is RUNNING. If the default weren't its first element, the
  // menu would lead with a model the conversation doesn't use — and the model
  // actually in progress would only appear relegated under « Modèle en cours ».
  it("commence par le modèle PAR DÉFAUT des nouvelles conversations", () => {
    expect(SIMPLE_MODEL_IDS[0]).toBe(DEFAULT_MODEL_ID);
  });

  it("reste COURTE — au-delà d'une poignée, ce n'est plus une simplification", () => {
    expect(SIMPLE_MODEL_IDS.length).toBeLessThanOrEqual(8);
  });
});

describe("simpleMenuModels", () => {
  it("rend les favoris DANS L'ORDRE de la liste", () => {
    const out = simpleMenuModels(ALL, SIMPLE_MODEL_IDS[0]);
    expect(out.map((m) => m.id)).toEqual([...SIMPLE_MODEL_IDS]);
  });

  it("écarte un favori que ce poste ne peut pas proposer (interdit par l'org)", () => {
    const sansPremier = ALL.filter((m) => m.id !== SIMPLE_MODEL_IDS[0]);
    const out = simpleMenuModels(sansPremier, SIMPLE_MODEL_IDS[1]);
    expect(out.map((m) => m.id)).not.toContain(SIMPLE_MODEL_IDS[0]);
  });

  // ⚠️ THE rule that avoids the absurd: switching to the simplified view with a model
  // chosen in the full view would make it DISAPPEAR from its own selector, the conversation
  // continuing to run on it. It's added at the TAIL — it doesn't become a favorite.
  it("garde le modèle COURANT même hors favoris, et en dernier", () => {
    const horsListe = MODELS.find(
      (m) => m.provider === "openrouter" && !SIMPLE_MODEL_IDS.includes(m.id),
    )!;
    const out = simpleMenuModels(ALL, horsListe.id);
    expect(out.map((m) => m.id)).toEqual([...SIMPLE_MODEL_IDS, horsListe.id]);
  });

  it("n'ajoute rien pour un modèle courant vide ou inconnu", () => {
    expect(simpleMenuModels(ALL, "").map((m) => m.id)).toEqual([...SIMPLE_MODEL_IDS]);
    expect(simpleMenuModels(ALL, "nexiste/pas").map((m) => m.id)).toEqual([...SIMPLE_MODEL_IDS]);
  });

  it("ne duplique pas le courant quand il EST un favori", () => {
    const out = simpleMenuModels(ALL, SIMPLE_MODEL_IDS[2]);
    expect(out.filter((m) => m.id === SIMPLE_MODEL_IDS[2])).toHaveLength(1);
  });
});

describe("favoris personnalisés", () => {
  // Two OpenRouter ids from the registry, outside the default list, to play chosen favorites.
  const custom = MODELS.filter(
    (m) => m.provider === "openrouter" && !SIMPLE_MODEL_IDS.includes(m.id),
  ).slice(0, 2);

  it("les favoris de l'utilisateur REMPLACENT la liste par défaut", () => {
    const fav = custom.map((m) => m.id);
    const out = simpleMenuModels(ALL, fav[0], fav);
    expect(out.map((m) => m.id)).toEqual(fav);
    // and no id from the default catalogue invites itself in
    expect(out.some((m) => SIMPLE_MODEL_IDS.includes(m.id))).toBe(false);
  });

  it("favoris vides ⇒ on garde le défaut catalogue", () => {
    expect(simpleMenuModels(ALL, "", []).map((m) => m.id)).toEqual([...SIMPLE_MODEL_IDS]);
    expect(simpleMenuModels(ALL, "").map((m) => m.id)).toEqual([...SIMPLE_MODEL_IDS]);
  });

  // ⚠️ The invariant « jamais un menu vide »: a favorite pinned then made unreachable
  // (removed from the registry, forbidden by the org) must not leave an empty selector.
  it("favoris tous inatteignables ⇒ repli sur le défaut catalogue", () => {
    const out = simpleMenuModels(ALL, "", ["nexiste/pas-1", "nexiste/pas-2"]);
    expect(out.map((m) => m.id)).toEqual([...SIMPLE_MODEL_IDS]);
  });

  it("le modèle courant reste ajouté en queue, même avec des favoris choisis", () => {
    const fav = [custom[0].id];
    const out = simpleMenuModels(ALL, custom[1].id, fav);
    expect(out.map((m) => m.id)).toEqual([custom[0].id, custom[1].id]);
  });

  it("favoriteSet reflète les favoris choisis, sinon le défaut", () => {
    expect(favoriteSet([custom[0].id]).has(custom[0].id)).toBe(true);
    expect(favoriteSet([custom[0].id]).has(SIMPLE_MODEL_IDS[0])).toBe(false);
    expect(favoriteSet(undefined).has(SIMPLE_MODEL_IDS[0])).toBe(true);
  });

  it("toggleFavoriteModel épingle en queue et retire, immuable", () => {
    expect(toggleFavoriteModel(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleFavoriteModel(["a", "b"], "a")).toEqual(["b"]);
    const src = ["a"];
    toggleFavoriteModel(src, "b");
    expect(src).toEqual(["a"]); // the original isn't mutated
  });

  // ⚠️ THE 14/08 BUG: on an empty list (= the default shown fully starred), removing
  // one of the 5 must leave the 4 OTHERS, never reduce to the single id touched. The first
  // gesture therefore materializes the default catalogue.
  it("retirer un favori affiché quand la liste est vide laisse les AUTRES (matérialise)", () => {
    const out = toggleFavoriteModel(undefined, SIMPLE_MODEL_IDS[0]);
    expect(out).toEqual(SIMPLE_MODEL_IDS.filter((id) => id !== SIMPLE_MODEL_IDS[0]));
    expect(out).toHaveLength(SIMPLE_MODEL_IDS.length - 1);
  });

  it("ajouter un NOUVEAU modèle sur une liste vide part du défaut + le nouveau", () => {
    const nouveau = MODELS.find(
      (m) => m.provider === "openrouter" && !SIMPLE_MODEL_IDS.includes(m.id),
    )!.id;
    expect(toggleFavoriteModel(undefined, nouveau)).toEqual([...SIMPLE_MODEL_IDS, nouveau]);
  });

  it("tout retirer re-bascule sur le défaut (une liste vide = réinitialiser)", () => {
    // removing the ids one by one, we end up at [] — which `favoriteSourceIds`/`simpleMenuModels`
    // read back as the default catalogue.
    let fav: string[] = [...SIMPLE_MODEL_IDS];
    for (const id of [...SIMPLE_MODEL_IDS]) fav = toggleFavoriteModel(fav, id);
    expect(fav).toEqual([]);
    expect(simpleMenuModels(ALL, "", fav).map((m) => m.id)).toEqual([...SIMPLE_MODEL_IDS]);
  });
});

/**
 * The BLOCKS of the short list (18/08) — a list of five identical lines doesn't say
 * why those five. What these cases pin: the ORDER (the default in front, wherever it's
 * pinned) and the absence of an empty block, which would be a heading with nothing under it.
 */
describe("simpleMenuSections — ce que chaque bloc annonce", () => {
  const m = (id: string) => ({ id, label: id, provider: "openrouter" }) as ModelInfo;

  it("sort le DÉFAUT de la liste des favoris et le met en tête", () => {
    const models = [m("a"), m("def"), m("b")];
    const sec = simpleMenuSections(models, { favSet: new Set(["a", "def", "b"]), defaultId: "def" }, fr);
    expect(sec.map((s) => [s.label, s.models.map((x) => x.id)])).toEqual([
      ["Par défaut", ["def"]],
      ["Favoris", ["a", "b"]],
    ]);
  });

  it("annonce le modèle en cours ajouté en queue, hors favoris", () => {
    const sec = simpleMenuSections([m("a"), m("cur")], { favSet: new Set(["a"]), defaultId: "a" }, fr);
    expect(sec.map((s) => s.label)).toEqual(["Par défaut", "Modèle en cours"]);
    expect(sec[1].models.map((x) => x.id)).toEqual(["cur"]);
  });

  it("aucun bloc VIDE : un intitulé sans ligne dessous est du bruit", () => {
    // Default unknown to the list ⇒ no « Par défaut » block.
    expect(simpleMenuSections([m("a")], { favSet: new Set(["a"]), defaultId: "zzz" }, fr)).toEqual([
      { label: "Favoris", models: [m("a")] },
    ]);
    // A single favorite, which IS the default ⇒ a single block, not an empty « Favoris ».
    expect(
      simpleMenuSections([m("a")], { favSet: new Set(["a"]), defaultId: "a" }, fr).map((s) => s.label),
    ).toEqual(["Par défaut"]);
    expect(simpleMenuSections([], { favSet: new Set(), defaultId: "a" }, fr)).toEqual([]);
  });

  it("le modèle courant qui est AUSSI le défaut reste « Modèle en cours »", () => {
    // It isn't pinned: what matters at this point of the list is that it comes from
    // the conversation, not from favorites.
    const sec = simpleMenuSections([m("a"), m("cur")], { favSet: new Set(["a"]), defaultId: "cur" }, fr);
    expect(sec.map((s) => s.label)).toEqual(["Favoris", "Modèle en cours"]);
  });
});
